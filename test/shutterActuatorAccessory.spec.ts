import { Channel, Device } from "freeathome-local-api-client";
import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
  WithUUID,
} from "homebridge";
import { FreeAtHomeContext } from "../src/freeAtHomeContext.js";
import { ShutterActuatorAccessory } from "../src/shutterActuatorAccessory.js";
import { EmptyGuid } from "../src/util.js";
import {
  createPlatformAccessory,
  MockFreeAtHomeHomebridgePlatform,
} from "./platform.mock.js";

describe("Shutter Accessory", () => {
  let channel: Channel;
  let device: Device;
  let platform: MockFreeAtHomeHomebridgePlatform;
  let platformAccessory: PlatformAccessory<FreeAtHomeContext>;

  beforeEach(() => {
    channel = {};
    device = {};
    platform = new MockFreeAtHomeHomebridgePlatform();
    platformAccessory = createPlatformAccessory("Shutter Accessory");
    platformAccessory.context = {
      channel: channel,
      channelId: "ch1234",
      device: device,
      deviceSerial: "ABB7xxxxxxxx",
    };
  });
  afterEach(() => {
    platform.resetLoggerCalls();
  });

  it("should be created with default state", async () => {
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    expect(accessory).toBeTruthy();
    const instance = accessory as unknown as {
      service: Service;
    };
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(0);
    expect(await characteristicTp.handleGetRequest()).toBe(0);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.STOPPED
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
  });

  it("should be created with opening state", async () => {
    channel.inputs = {
      idp0002: {
        value: "75",
      },
    };
    channel.outputs = {
      odp0000: {
        value: "2",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "1",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    expect(accessory).toBeTruthy();
    const instance = accessory as unknown as {
      service: Service;
    };
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(50);
    expect(await characteristicTp.handleGetRequest()).toBe(25);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.INCREASING
    );
    expect(await characteristicObs.handleGetRequest()).toBeTrue();
  });

  it("should be created with closing state", async () => {
    channel.inputs = {
      idp0002: {
        value: "25",
      },
    };
    channel.outputs = {
      odp0000: {
        value: "3",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    expect(accessory).toBeTruthy();
    const instance = accessory as unknown as {
      service: Service;
    };
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(50);
    expect(await characteristicTp.handleGetRequest()).toBe(75);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.DECREASING
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
  });

  it("should be created with stopped state", async () => {
    channel.inputs = {
      idp0002: {
        value: "50",
      },
    };
    channel.outputs = {
      odp0000: {
        value: "0",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    expect(accessory).toBeTruthy();
    const instance = accessory as unknown as {
      service: Service;
    };
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(50);
    expect(await characteristicTp.handleGetRequest()).toBe(50);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.STOPPED
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
  });

  it("should still send a request to set TargetPosition even if the cached value is unchanged", async () => {
    channel.inputs = {
      idp0002: {
        value: "50",
      },
    };
    channel.outputs = {
      odp0000: {
        value: "0",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    expect(accessory).toBeTruthy();
    const instance = accessory as unknown as {
      service: Service;
    };
    const characteristic = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    expect(await characteristic.handleGetRequest()).toBe(50);
    const spy = spyOn(accessory.platform.sysap, "setDatapoint");
    await characteristic.handleSetRequest(50);
    expect(spy).toHaveBeenCalled();
  });

  it("should handle request to set TargetPosition characteristic if the value has changed", async () => {
    channel.inputs = {
      idp0002: {
        value: "50",
      },
    };
    channel.outputs = {
      odp0000: {
        value: "0",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    expect(accessory).toBeTruthy();
    const instance = accessory as unknown as {
      service: Service;
    };
    const characteristic = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    expect(await characteristic.handleGetRequest()).toBe(50);
    const spy = spyOn(accessory.platform.sysap, "setDatapoint");
    await characteristic.handleSetRequest(70);
    expect(spy).toHaveBeenCalledWith(
      EmptyGuid,
      "ABB7xxxxxxxx",
      "ch1234",
      "idp0002",
      "30"
    );

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(platform.log.info).toHaveBeenCalledWith(
      "Shutter Accessory (Shutter Actuator ABB7xxxxxxxx (ch1234)) set characteristic TargetPosition -> 70"
    );
  });

  it("should ignore update if datapoint is unknown", async () => {
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    const instance = accessory as unknown as {
      service: Service;
      doUpdateDatapoint: (
        acccessoryDisplayType: string,
        service: Service,
        characteristic: WithUUID<new () => Characteristic>,
        characteristicValue: CharacteristicValue
      ) => void;
    };
    const spy = spyOn(instance, "doUpdateDatapoint");
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(0);
    expect(await characteristicTp.handleGetRequest()).toBe(0);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.STOPPED
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
    accessory.updateDatapoint("test", "");
    expect(spy).not.toHaveBeenCalled();
  });

  it("should process update to position state datapoint", async () => {
    channel.outputs = {
      odp0000: {
        value: "0",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    const instance = accessory as unknown as {
      service: Service;
      doUpdateDatapoint: (
        acccessoryDisplayType: string,
        service: Service,
        characteristic: WithUUID<new () => Characteristic>,
        characteristicValue: CharacteristicValue
      ) => void;
    };
    const spy = spyOn(instance, "doUpdateDatapoint");
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(50);
    expect(await characteristicTp.handleGetRequest()).toBe(50);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.STOPPED
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
    accessory.updateDatapoint("odp0000", "2");
    expect(spy).toHaveBeenCalledWith(
      "Shutter Actuator",
      instance.service,
      accessory.platform.Characteristic.PositionState,
      accessory.platform.Characteristic.PositionState.INCREASING
    );
  });
  it("should process update to current position datapoint", async () => {
    channel.outputs = {
      odp0000: {
        value: "0",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    const instance = accessory as unknown as {
      service: Service;
      doUpdateDatapoint: (
        acccessoryDisplayType: string,
        service: Service,
        characteristic: WithUUID<new () => Characteristic>,
        characteristicValue: CharacteristicValue
      ) => void;
    };
    const spy = spyOn(instance, "doUpdateDatapoint");
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(50);
    expect(await characteristicTp.handleGetRequest()).toBe(50);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.STOPPED
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
    accessory.updateDatapoint("odp0001", "25");
    expect(spy).toHaveBeenCalledWith(
      "Shutter Actuator",
      instance.service,
      accessory.platform.Characteristic.CurrentPosition,
      75
    );
  });
  it("should process update to obstruction datapoint", async () => {
    channel.outputs = {
      odp0000: {
        value: "0",
      },
      odp0001: {
        value: "50",
      },
      odp0003: {
        value: "0",
      },
    };
    const accessory = new ShutterActuatorAccessory(platform, platformAccessory);
    const instance = accessory as unknown as {
      service: Service;
      doUpdateDatapoint: (
        acccessoryDisplayType: string,
        service: Service,
        characteristic: WithUUID<new () => Characteristic>,
        characteristicValue: CharacteristicValue
      ) => void;
    };
    const spy = spyOn(instance, "doUpdateDatapoint");
    const characteristicCp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.CurrentPosition
    );
    const characteristicTp = instance.service.getCharacteristic(
      accessory.platform.Characteristic.TargetPosition
    );
    const characteristicPs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.PositionState
    );
    const characteristicObs = instance.service.getCharacteristic(
      accessory.platform.Characteristic.ObstructionDetected
    );
    expect(await characteristicCp.handleGetRequest()).toBe(50);
    expect(await characteristicTp.handleGetRequest()).toBe(50);
    expect(await characteristicPs.handleGetRequest()).toBe(
      accessory.platform.Characteristic.PositionState.STOPPED
    );
    expect(await characteristicObs.handleGetRequest()).toBeFalse();
    accessory.updateDatapoint("odp0003", "1");
    expect(spy).toHaveBeenCalledWith(
      "Shutter Actuator",
      instance.service,
      accessory.platform.Characteristic.ObstructionDetected,
      true
    );
  });
  describe("target position sync for movements outside of HomeKit", () => {
    const setup = (): {
      accessory: ShutterActuatorAccessory;
      tp: () => Promise<unknown>;
    } => {
      // fully open (HomeKit 100), stopped; last HomeKit target is 100
      channel.inputs = { idp0002: { value: "0" } };
      channel.outputs = {
        odp0000: { value: "0" },
        odp0001: { value: "0" },
        odp0003: { value: "0" },
      };
      const accessory = new ShutterActuatorAccessory(
        platform,
        platformAccessory
      );
      const service = (accessory as unknown as { service: Service }).service;
      const c = service.getCharacteristic(
        accessory.platform.Characteristic.TargetPosition
      );
      return { accessory, tp: () => c.handleGetRequest() };
    };

    it("should follow the current position when stopped after a physical button press", async () => {
      const { accessory, tp } = setup();
      // wall button: starts closing, stops, final position arrives after stop
      accessory.updateDatapoint("odp0000", "3");
      expect(await tp()).toBe(0);
      accessory.updateDatapoint("odp0000", "0");
      accessory.updateDatapoint("odp0001", "15");
      expect(await tp()).toBe(85);
    });

    it("should set target to 100 when opening starts below target", async () => {
      const { accessory, tp } = setup();
      accessory.updateDatapoint("odp0001", "50");
      accessory.updateDatapoint("odp0000", "2");
      expect(await tp()).toBe(100);
    });

    it("should keep an intermediate HomeKit target while moving towards it", async () => {
      const { accessory } = setup();
      const service = (accessory as unknown as { service: Service }).service;
      const characteristic = service.getCharacteristic(
        accessory.platform.Characteristic.TargetPosition
      );
      spyOn(accessory.platform.sysap, "setDatapoint").and.resolveTo();
      await characteristic.handleSetRequest(30);
      // closing towards the target, intermediate position updates arrive
      accessory.updateDatapoint("odp0000", "3");
      accessory.updateDatapoint("odp0001", "40");
      expect(await characteristic.handleGetRequest()).toBe(30);
      // target reached
      accessory.updateDatapoint("odp0000", "0");
      accessory.updateDatapoint("odp0001", "70");
      expect(await characteristic.handleGetRequest()).toBe(30);
    });

    it("should not replace a HomeKit target with 0/100 when position reaches it while still moving", async () => {
      const { accessory } = setup();
      const service = (accessory as unknown as { service: Service }).service;
      const characteristic = service.getCharacteristic(
        accessory.platform.Characteristic.TargetPosition
      );
      spyOn(accessory.platform.sysap, "setDatapoint").and.resolveTo();
      await characteristic.handleSetRequest(50);
      // closing from fully open (100) towards HomeKit target 50
      accessory.updateDatapoint("odp0000", "3");
      accessory.updateDatapoint("odp0001", "40");
      expect(await characteristic.handleGetRequest()).toBe(50);
      // current catches up to (or passes) the HomeKit target while still moving;
      // must not treat that as an external move and force TargetPosition to 0
      accessory.updateDatapoint("odp0001", "50");
      expect(await characteristic.handleGetRequest()).toBe(50);
      accessory.updateDatapoint("odp0001", "55");
      expect(await characteristic.handleGetRequest()).toBe(50);
    });
  });
});
