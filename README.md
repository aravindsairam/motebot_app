# MOTEbot app

The Android app for [MOTEbot](https://github.com/aravindsairam/motebot), a robot vacuum cleaner built and tested fully in simulation. Made with React Native and Expo, in TypeScript.

## What you can do with it

- **See the home.** The live map with the robot on it, and the robot's camera in a small window.
- **Send it somewhere.** Tap a spot on the map and the robot drives there.
- **Drive it.** A joystick, and the robot stops the moment you let go.
- **Make a map.** Drive around, or press Explore and watch the map grow.
- **Clean.** Everything, an area you draw, or one spot. You see the rows and the time before it starts.
- **Keep it out.** Draw no-go zones on the map.
- **Look back.** Every clean is kept with its numbers and a picture.

## Setup

You need Node.js 22, Java 17 and the Android SDK with an emulator, with `JAVA_HOME` and `ANDROID_HOME` set. Get the code through the [main repo](https://github.com/aravindsairam/motebot):

```bash
git clone --recursive https://github.com/aravindsairam/motebot
cd motebot/app
npm install
```

## Run

Start the simulator and the robot first. The main repo shows how. Then start the emulator and run:

```bash
npx expo run:android
```

The first build takes several minutes. On the Connect screen, type the address of the PC. From the emulator that is `10.0.2.2`.

## Tests

```bash
npm test             # unit tests
npm run typecheck    # types
```

## License

Apache 2.0
