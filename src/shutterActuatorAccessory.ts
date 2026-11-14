import { CharacteristicValue, PlatformAccessory, Service } from "homebridge";
import { FreeAtHomeAccessory } from "./freeAtHomeAccessory.js";
import { FreeAtHomeContext } from "./freeAtHomeContext.js";
import { FreeAtHomeHomebridgePlatform } from "./platform.js";
import { EmptyGuid, convertToString } from "./util.js";

/**
 * A shutter actuator accessory
 * @description
 * A shutter actuator can be used to control more or less any free&#64;home device
 * that controls windows coverings. The rolling blind actuator, the attic window and
 * the awning actuator are also supported by this actuator.
 */
export class ShutterActuatorAccessory extends FreeAtHomeAccessory {
  private readonly service: Service;
  private stateCurrentPosition: number;
  private statePositionState: number;
  private stateTargetPosition: number;
  private stateObstructed: boolean;

  /**
   * Constructs a new Shutter Actuator accessory instance.
   * @param platform The free&#64;home Homebridge platform controlling the accessory
   * @param accessory The platform accessory.
   */
  constructor(
    readonly platform: FreeAtHomeHomebridgePlatform,
    readonly accessory: PlatformAccessory<FreeAtHomeContext>
  ) {
    super(platform, accessory);

    // set initial state
    this.stateCurrentPosition =
      100 -
      parseInt(this.accessory.context.channel.outputs?.odp0001.value ?? "100");
    this.statePositionState = this.getPositionState(
      this.accessory.context.channel.outputs?.odp0000.value
    );
    const targetPosition = this.accessory.context.channel.inputs?.idp0002.value;
    this.stateTargetPosition =
      targetPosition &&
      this.statePositionState !==
        this.platform.Characteristic.PositionState.STOPPED
        ? 100 - parseInt(targetPosition)
        : this.stateCurrentPosition;
    this.stateObstructed = !!parseInt(
      this.accessory.context.channel.outputs?.odp0003.value ?? "0"
    );

    // get the Window Covering service if it exists, otherwise create a new service instance
    this.service =
      this.accessory.getService(this.platform.Service.WindowCovering) ||
      this.accessory.addService(this.platform.Service.WindowCovering);

    // register handlers for the Current Position characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(() => this.stateCurrentPosition)
      .setProps({
        maxValue: 100,
        minValue: 0,
        minStep: 1,
      });
    // register handlers for the Position State characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(() => this.statePositionState)
      .setProps({
        validValues: [0, 1, 2],
      });
    // register handlers for the Target Position characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(() => this.stateTargetPosition)
      .onSet(this.setTargetPosition.bind(this))
      .setProps({
        maxValue: 100,
        minValue: 0,
        minStep: 1,
      });
    // register handlers for the Obstruction Detected characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.ObstructionDetected)
      .onGet(() => this.stateObstructed);
  }

  private getPositionState(value: string | undefined): number {
    switch (value) {
      case "2":
        return this.platform.Characteristic.PositionState.INCREASING;
      case "3":
        return this.platform.Characteristic.PositionState.DECREASING;
      default:
        return this.platform.Characteristic.PositionState.STOPPED;
    }
  }

  /**
   * Aligns the target position with the actual movement, because movements
   * triggered outside of HomeKit never update the target position.
   */
  private syncTargetPosition(): void {
    const { PositionState } = this.platform.Characteristic;
    let target = this.stateTargetPosition;
    if (this.statePositionState === PositionState.STOPPED) {
      target = this.stateCurrentPosition;
    } else if (
      this.statePositionState === PositionState.INCREASING &&
      target <= this.stateCurrentPosition
    ) {
      target = 100;
    } else if (
      this.statePositionState === PositionState.DECREASING &&
      target >= this.stateCurrentPosition
    ) {
      target = 0;
    }
    if (target === this.stateTargetPosition) return;

    this.stateTargetPosition = target;
    this.doUpdateDatapoint(
      "Shutter Actuator",
      this.service,
      this.platform.Characteristic.TargetPosition,
      target
    );
  }

  private async setTargetPosition(value: CharacteristicValue): Promise<void> {
    // always send the command: the cached target can be stale after the
    // shutter was moved by a physical button, so it must not suppress commands
    this.stateTargetPosition = value as number;

    // log event
    this.platform.log.info(
      `${this.accessory.displayName} (Shutter Actuator ${
        this.serialNumber
      }) set characteristic TargetPosition -> ${convertToString(value)}`
    );

    // set data point at SysAP
    await this.platform.sysap.setDatapoint(
      EmptyGuid,
      this.accessory.context.deviceSerial,
      this.accessory.context.channelId,
      "idp0002",
      convertToString(100 - this.stateTargetPosition)
    );
  }

  public override updateDatapoint(datapoint: string, value: string): void {
    // ignore unknown data points
    switch (datapoint) {
      case "odp0000":
        this.statePositionState = this.getPositionState(value);
        // do the update
        this.doUpdateDatapoint(
          "Shutter Actuator",
          this.service,
          this.platform.Characteristic.PositionState,
          this.statePositionState
        );
        // keep the target in sync when moved by other means (e.g. wall button)
        this.syncTargetPosition();
        return;
      case "odp0001":
        this.stateCurrentPosition = 100 - parseInt(value);
        this.doUpdateDatapoint(
          "Shutter Actuator",
          this.service,
          this.platform.Characteristic.CurrentPosition,
          this.stateCurrentPosition
        );
        // Only align when stopped: the final position may arrive after the
        // stop notification. Applying the moving-direction heuristic here
        // would replace a HomeKit intermediate target with 0/100 once the
        // reported position reaches or passes it while still moving.
        if (
          this.statePositionState ===
          this.platform.Characteristic.PositionState.STOPPED
        ) {
          this.syncTargetPosition();
        }
        return;
      case "odp0003":
        this.stateObstructed = !!parseInt(value);
        this.doUpdateDatapoint(
          "Shutter Actuator",
          this.service,
          this.platform.Characteristic.ObstructionDetected,
          this.stateObstructed
        );
        return;
      default:
        return;
    }
  }
}
