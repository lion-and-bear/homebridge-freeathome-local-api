import {
  Channel,
  Configuration,
  Device,
  Logger as FreeAtHomeLogger,
  SystemAccessPoint,
  WebSocketMessage,
} from "freeathome-local-api-client";
import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  UnknownContext,
} from "homebridge";
import { globalAgent } from "node:https";
import { Subscription } from "rxjs";
import { Agent, setGlobalDispatcher } from "undici";
import { WeatherStationBrightnessSensorAccessory } from "./brightnessSensorAccessory.js";
import { ContactSensorAccessory } from "./contactSensorAccessory.js";
import { DimmerAccessory } from "./dimmerAccessory.js";
import { DoorOpenerAccessory } from "./doorOpenerAccessory.js";
import { FreeAtHomeAccessory } from "./freeAtHomeAccessory.js";
import {
  FreeAtHomeContext,
  isFreeAtHomeAccessory,
} from "./freeAtHomeContext.js";
import {
  experimentallySupportedFunctionIDs,
  FunctionID,
} from "./functionId.js";
import { MotionSensorAccessory } from "./motionSensorAccessory.js";
import { RadiatorActuatorAccessory } from "./radiatorActuatorAccessory.js";
import { RoomTemperatureControllerAccessory } from "./roomTemperatureControllerAccessory.js";
import { SceneAccessory } from "./sceneAccessory.js";
import { SceneSensorAccessory } from "./sceneSensorAccessory.js";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import { ShutterActuatorAccessory } from "./shutterActuatorAccessory.js";
import { SmokeDetectorAccessory } from "./smokeDetectorAccessory.js";
import { StaircaseLightSensorAccessory } from "./staircaseLightSensor.js";
import { SwitchActuatorAccessory } from "./switchActuatorAccessory.js";
import { SwitchSensorAccessory } from "./switchSensorAccessory.js";
import { WeatherStationTemperatureSensorAccessory } from "./temperatureSensorAccessory.js";
import { TriggerSensorAccessory } from "./triggerSensorAccessory.js";
import { AccessoryType, TypeMapping } from "./typeMappings.js";
import { APP_VERSION, EmptyGuid } from "./util.js";

const DelayFactor = 200;

/** The free&#64;home Homebridge platform. */
export class FreeAtHomeHomebridgePlatform implements DynamicPlatformPlugin {
  /** The service reference */
  public readonly Service: typeof Service;
  /** The characteristic reference */
  public readonly Characteristic: typeof Characteristic;
  /** The list of restored cached accessories */
  public readonly accessories: Array<PlatformAccessory<FreeAtHomeContext>> = [];
  private readonly removedAccessories: Array<
    PlatformAccessory<UnknownContext>
  > = [];
  /** The system access point */
  public readonly sysap: SystemAccessPoint;
  private readonly fahAccessories = new Map<string, FreeAtHomeAccessory>();
  private readonly fahLogger: FreeAtHomeLogger;
  private readonly webSocketSubscription: Subscription;
  private wsConnectionAttempt = 0;
  private readonly maxWsRetryCount: number;

  private get experimentalMode(): boolean {
    return this.config.experimental as boolean;
  }

  /**
   * Constructs a new free&#64;home Homebridge platform instance.
   * @param log {Logger} The logger instance.
   * @param config {PlatformConfig} The platform configuration.
   * @param api {API} The API instance.
   */
  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    // log plugin version
    this.log.debug("Homebridge free@home Local API Plugin ", APP_VERSION);
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    // set maximum reconnection attempt count
    this.maxWsRetryCount = (this.config.maxWsRetryCount as number) ?? 10;

    // Create a logger for the free&#64;home Local API Client
    this.fahLogger = {
      debug: (message?: unknown, ...optionalParams: unknown[]) =>
        log.debug(<string>message, ...optionalParams),
      error: (message?: unknown, ...optionalParams: unknown[]) =>
        log.error(<string>message, ...optionalParams),
      log: (message?: unknown, ...optionalParams: unknown[]) =>
        log.info(<string>message, ...optionalParams),
      warn: (message?: unknown, ...optionalParams: unknown[]) =>
        log.warn(<string>message, ...optionalParams),
    };

    // Create a system access point instance
    this.sysap = new SystemAccessPoint(
      this.config.host as string,
      this.config.user as string,
      this.config.password as string,
      this.config.tlsEnabled as boolean,
      this.config.verboseErrors as boolean,
      this.fahLogger
    );

    // TLS Verification
    setGlobalDispatcher(
      new Agent({
        connect: {
          rejectUnauthorized: !this.config.disableCertificateVerification,
        },
      })
    );
    globalAgent.options.rejectUnauthorized =
      !this.config.disableCertificateVerification;

    // React to web socket events
    this.sysap.on("websocket-open", () => {
      this.wsConnectionAttempt = 0;
    });
    this.sysap.on("websocket-close", (code: number, reason: Buffer) => {
      if (code === 1000) return;

      this.log.warn(
        `Websocket to System Access Point was closed with code ${code.toString()}: ${reason.toString()}`
      );
      if (this.wsConnectionAttempt >= this.maxWsRetryCount) {
        this.log.error(
          "Maximum retry count exceeded. Will not try to reconnect to websocket again."
        );
        return;
      }

      const delay = DelayFactor * 2 ** this.wsConnectionAttempt++;
      this.log.info(
        `Attempting to reconnect in ${delay}ms [${this.wsConnectionAttempt}/${this.maxWsRetryCount}]`
      );
      setTimeout(
        () =>
          this.sysap.connectWebSocket(
            !this.config.disableCertificateVerification
          ),
        delay
      );
    });

    // Subscribe to web socket messages
    this.webSocketSubscription = this.sysap
      .getWebSocketMessages()
      .subscribe((message: WebSocketMessage) =>
        this.processWebSocketMesage(message)
      );

    // Experimental mode
    if (this.experimentalMode) this.log.warn("Experimental Mode enabled!");

    this.log.debug("Finished initializing platform:", this.config.name);

    // When Homebridge has restored all cached accessories from disk we can start discovery of new accessories.
    this.api.on("didFinishLaunching", () => {
      log.debug("Executed didFinishLaunching callback");

      // Unregister removed accessories
      this.api.unregisterPlatformAccessories(
        PLUGIN_NAME,
        PLATFORM_NAME,
        this.removedAccessories
      );

      // run discovery
      this.discoverDevices()
        .then(() =>
          this.log.info(
            `Discovery completed: ${this.fahAccessories.size} accessories detected`
          )
        )
        .catch((error) => this.log.error("Device discovery failed", error));

      // Connect to system access point web socket
      this.sysap.connectWebSocket(!this.config.disableCertificateVerification);
    });
    this.api.on("shutdown", () => {
      log.debug("Executed shutdown callback");
      this.webSocketSubscription.unsubscribe();
    });
  }

  /**
   * Configures the specified accessory.
   * @param accessory The accessory to be configured.
   * @description
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  public configureAccessory(accessory: PlatformAccessory) {
    // Remove cached non-free@home devices
    if (!isFreeAtHomeAccessory(accessory, this.fahLogger)) {
      this.removedAccessories.push(accessory);
      this.log.warn(
        "Removing accessory from cache (no free@home device):",
        accessory.displayName
      );
      return;
    }

    // Remove cached disallowed devices
    if (
      !this.isAllowedChannel(
        accessory.context.deviceSerial,
        accessory.context.channelId
      )
    ) {
      this.removedAccessories.push(accessory);
      this.log.warn(
        "Removing accessory from cache (channel not on allow list):",
        accessory.displayName
      );
      return;
    }

    // Remove cached ignored devices
    if (
      this.isIgnoredChannel(
        accessory.context.deviceSerial,
        accessory.context.channelId
      )
    ) {
      this.removedAccessories.push(accessory);
      this.log.warn(
        "Removing accessory from cache (channel on ignore list):",
        accessory.displayName
      );
      return;
    }

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.log.info("Loading accessory from cache:", accessory.displayName);
    this.accessories.push(accessory);
  }

  /** Discovers the supported free&#64;home devices from the System Access Point. */
  private async discoverDevices(): Promise<void> {
    // Get the SysAP configuration
    const config: Configuration = await this.sysap.getConfiguration();

    // Enmumerate the devices
    for (const serial of Object.keys(config[EmptyGuid].devices)) {
      // Filter unsupported devices by serial range
      if (
        !serial.startsWith("ABB") && // free@home default
        !serial.startsWith("0007") && // new free@home devices
        !serial.startsWith("E11") && // alarm services
        !serial.startsWith("7EB1") && // weather station
        !serial.startsWith("FFFF480") // Scenes
        // !serial.startsWith("FFFF4000") // Light groups
      )
        continue;

      // Filter devices without channels
      const device = config[EmptyGuid].devices[serial];
      if (!device.channels) continue;

      // Room and Floor may be defined either on device or on channel level.
      // Here we check if the location is defined on device level.
      const locationConfiguredOnDeviceLevel = !!device.floor && !!device.room;

      // Enumerate the channels
      for (const channelId of Object.keys(device.channels)) {
        try {
          this.processChannel(
            serial,
            device,
            channelId,
            device.channels[channelId],
            locationConfiguredOnDeviceLevel
          );
        } catch (error) {
          this.log.error(
            `Error processing discovered channel ${serial}/${channelId}`,
            error
          );
        }
      }
    }
  }

  private processChannel(
    serial: string,
    device: Device,
    channelId: string,
    channel: Channel,
    locationConfiguredOnDeviceLevel: boolean
  ): void {
    // We are enumerating the keys of the channels object. Neither the channels object nor the channelId can possibly be undefined.
    if (
      !this.isViableChannel(
        serial,
        channelId,
        channel,
        locationConfiguredOnDeviceLevel
      )
    )
      return;

    // Create or restore the accessory
    const uuid = this.api.hap.uuid.generate(`${serial}_${channelId}`);
    let accessory = this.accessories.find((a) => a.UUID === uuid);
    if (accessory) {
      // the accessory already exists
      this.log.info(
        "Restoring existing accessory from cache:",
        accessory.displayName
      );
      // Update context
      accessory.context.deviceSerial = serial;
      accessory.context.device = device;
      accessory.context.channel = channel;
      accessory.context.channelId = channelId;
      this.api.updatePlatformAccessories([accessory]);
      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // remove platform accessories when no longer present
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info("Adding new accessory:", channel.displayName);
      // create a new accessory
      accessory = new this.api.platformAccessory<FreeAtHomeContext>(
        channel.displayName ?? uuid,
        uuid
      );
      accessory.context.deviceSerial = serial;
      accessory.context.device = device;
      accessory.context.channel = channel;
      accessory.context.channelId = channelId;
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }

    // This check is used to apply the type guard so the accessory can be used as a free@home accesory without a cast.
    // Given that the accessory context is constructed in the previous lines, it is impossible for the type check to fail.
    // Consequently the branch can never be covered and is excluded from the coverage.
    /* c8 ignore next */
    if (!isFreeAtHomeAccessory(accessory, this.fahLogger)) return;
    // create accessory
    this.createAccessory(
      serial,

      channel.functionID!, // The functionID is guaranteed to be defined by the isViableChannel function.
      channelId,
      accessory
    );
  }

  private isViableChannel(
    serial: string,
    channelId: string,
    channel: Channel,
    locationConfiguredOnDeviceLevel: boolean
  ): channel is Channel {
    // Filter unsupported channels
    if (!(
      channel.functionID &&
      Object.values<string>(FunctionID).includes(
        channel.functionID.toUpperCase()
      )
    )) {
      this.log.debug(
        `Ignored ${serial} (${channelId}): FunctionID '${
          channel.functionID ?? "<UNDEFINED>"
        }' is not supported.`
      );
      return false;
    }

    // Filter unconfigured devices
    if (!locationConfiguredOnDeviceLevel && !(channel.floor && channel.room)) {
      this.log.debug(
        `Ignored ${serial} (${channelId}): Floor and room are not configured.`
      );
      return false;
    }

    // Filter allowed devices
    if (!this.isAllowedChannel(serial, channelId)) {
      this.log.debug(
        `Ignored ${serial} (${channelId}): Channel is not listed on the allow list.`
      );
      return false;
    }

    // Filter ignored devices
    if (this.isIgnoredChannel(serial, channelId)) {
      this.log.debug(
        `Ignored ${serial} (${channelId}): Channel is listed on the ignore list.`
      );
      return false;
    }

    // Filter experimental devices
    if (
      !this.experimentalMode &&
      experimentallySupportedFunctionIDs.includes(
        channel.functionID.toUpperCase() as FunctionID
      )
    ) {
      return false;
    }

    return true;
  }
  private createAccessory(
    serial: string,
    functionID: string,
    channelId: string,
    accessory: PlatformAccessory<FreeAtHomeContext>
  ): void {
    const accessoryType = this.resolveAccessoryType(serial, channelId);

    switch (functionID.toUpperCase() as FunctionID) {
      case FunctionID.FID_SWITCH_SENSOR:
      case FunctionID.FID_DIMMING_SENSOR:
      case FunctionID.FID_DES_DOOR_RINGING_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new SwitchSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_DES_AUTOMATIC_DOOR_OPENER_ACTUATOR:
      case FunctionID.FID_SWITCH_ACTUATOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new SwitchActuatorAccessory(this, accessory, accessoryType)
        );
        return;
      case FunctionID.FID_ROOM_TEMPERATURE_CONTROLLER_MASTER_WITHOUT_FAN:
      case FunctionID.FID_PANEL_ROOM_TEMPERATURE_CONTROLLER_MASTER_WITHOUT_FAN:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new RoomTemperatureControllerAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_DIMMING_ACTUATOR:
      case FunctionID.FID_RGB_ACTUATOR:
      case FunctionID.FID_RGB_W_ACTUATOR:
      case FunctionID.FID_DIMMING_ACTUATOR_TYPE0:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new DimmerAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_SMOKE_DETECTOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new SmokeDetectorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_MOVEMENT_DETECTOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new MotionSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_DES_DOOR_OPENER_ACTUATOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new DoorOpenerAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_SHUTTER_ACTUATOR:
      case FunctionID.FID_BLIND_ACTUATOR:
      case FunctionID.FID_ATTIC_WINDOW_ACTUATOR:
      case FunctionID.FID_AWNING_ACTUATOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new ShutterActuatorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_SCENE:
      case FunctionID.FID_SPECIAL_SCENE_PANIC:
      case FunctionID.FID_SPECIAL_SCENE_ALL_OFF:
      case FunctionID.FID_SPECIAL_SCENE_ALL_BLINDS_UP:
      case FunctionID.FID_SPECIAL_SCENE_ALL_BLINDS_DOWN:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new SceneAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_SCENE_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new SceneSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_WELCOME_IP_DOOR_OPEN_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new ContactSensorAccessory(this, accessory, 2)
        );
        return;
      case FunctionID.FID_WINDOW_DOOR_SENSOR:
      case FunctionID.FID_WINDOW_DOOR_POSITION_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new ContactSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_STAIRCASE_LIGHT_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new StaircaseLightSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_TRIGGER:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new TriggerSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_TEMPERATURE_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new WeatherStationTemperatureSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_BRIGHTNESS_SENSOR:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new WeatherStationBrightnessSensorAccessory(this, accessory)
        );
        return;
      case FunctionID.FID_RADIATOR_ACTUATOR_MASTER:
        this.fahAccessories.set(
          `${serial}_${channelId}`,
          new RadiatorActuatorAccessory(this, accessory)
        );
        return;
      default:
        this.log.error(
          `${serial} (${channelId}): Cannot configure accessory for FunctionID '${functionID}'!`
        );
    }
  }

  private isAllowedChannel(device: string, channel: string): boolean {
    if (!this.config.allowedChannels) return true;

    return (this.config.allowedChannels as Array<string>).some(
      (e) =>
        e.toUpperCase() === `${device.toUpperCase()}/*` ||
        e.toUpperCase() === `${device.toUpperCase()}/${channel.toUpperCase()}`
    );
  }

  private isIgnoredChannel(device: string, channel: string): boolean {
    if (!this.config.ignoredChannels) return false;

    return (this.config.ignoredChannels as Array<string>).some(
      (e) =>
        e.toUpperCase() === `${device.toUpperCase()}/*` ||
        e.toUpperCase() === `${device.toUpperCase()}/${channel.toUpperCase()}`
    );
  }

  private processWebSocketMesage(message: WebSocketMessage): void {
    // Get data point identifiers
    const datapoints = Object.keys(message[EmptyGuid].datapoints);

    for (const datapoint of datapoints) {
      // Ignore data points that have an unexpected format
      const match = /^([a-z0-9]{12})\/(ch[\da-f]{4})\/([io]dp\d{4})$/i.exec(
        datapoint
      );
      if (!match) {
        this.log.debug(`Ignored datapoint ${datapoint}: Unexpected format`);
        return;
      }

      // Ignore the data point if we don't have an accessory for it or update the accessory
      this.fahAccessories
        .get(`${match[1]}_${match[2]}`)
        ?.updateDatapoint(match[3], message[EmptyGuid].datapoints[datapoint]);
    }
  }

  private resolveAccessoryType(device: string, channel: string): AccessoryType {
    if (!this.config.typeMappings) return AccessoryType.Undefined;

    const key = `${device.toUpperCase()}/${channel.toUpperCase()}`;
    const mappings = (this.config.typeMappings as Array<TypeMapping>).filter(
      (e) => e.channel.toUpperCase() === key
    );

    switch (mappings.length) {
      case 0:
        return AccessoryType.Undefined;
      case 1:
        break;
      default:
        this.log.warn(
          `Multiple type mappings are defined for channel '${key}'. The first mapping is used.`
        );
        break;
    }

    return AccessoryType[mappings[0].type] ?? AccessoryType.Undefined;
  }
}
