# Automatic Garbage Feeder

A Node.js app that watches a webcam pointed at a garbage bin lid, detects when
an item is placed in front of it and has settled, classifies the item as
recyclable or non-recyclable using a Teachable Machine model, and sends the
result to an Arduino.

Pipeline:

```
Webcam (always on) -> presence detection -> capture frame -> classify with AI model -> send result to Arduino
```

The classification result is a single value:

- `1` = Recyclable
- `0` = Non-Recyclable

## How it works

1. `src/motionWatcher.js` uses `ffmpeg` to continuously pull frames from the
   webcam. On startup it averages the first few frames into a reference image
   of the empty bin. From then on, each new frame is compared against that
   reference (to tell if something is there at all) and against the previous
   frame (to tell if it has stopped moving). Only when an item is both
   present and still for several frames in a row does it count as "settled"
   and fire a trigger. Pulling an item away does not trigger anything, since
   that just makes the frame match the empty-bin reference again.
2. On trigger, the current frame is sent to `src/classifier.js`, which loads
   the exported Teachable Machine model and runs it on that frame.
3. The result (`1` or `0`) is passed to `src/arduino.js`, which is where you
   plug in your existing serial/communication code to the Arduino.
4. `src/server.js` runs a small web server so you can check the last
   classification result, and watch a live view of what the camera sees, from
   a browser or another device.

Everything runs in a single Node.js process on the same computer the webcam
is plugged into.

## Prerequisites

Install these on the machine that will run this project (the computer with
the webcam attached). This project is developed on Linux but production runs
on Windows, so both are covered below.

Common to both operating systems:

- Node.js version 18 or newer (tested with Node 22). Check with `node -v`.
- npm (comes with Node.js). Check with `npm -v`.
- `ffmpeg`, used to capture frames from the webcam. Check with
  `ffmpeg -version`.
- A USB webcam connected to the machine.

No C/C++ build tools, cmake, or OpenCV are required. All image processing is
done with the `sharp` npm package, which ships with prebuilt binaries, so
`npm install` should only take a minute or two.

### Linux setup

On Debian/Ubuntu-based systems:

```
sudo apt-get update
sudo apt-get install ffmpeg
```

Node.js itself is best installed via [nvm](https://github.com/nvm-sh/nvm) or
your distro's package manager.

#### Webcam permissions (Linux)

Your user needs permission to access the camera device. Check with:

```
groups
```

If `video` is not listed, add yourself to the `video` group and then log out
and back in:

```
sudo usermod -aG video $USER
```

### Windows setup

You need:

- Node.js for Windows, installed from [nodejs.org](https://nodejs.org).
- `ffmpeg` for Windows. Easiest way is with
  [Chocolatey](https://chocolatey.org/):

  ```
  choco install ffmpeg
  ```

  Or download a build from [ffmpeg.org](https://ffmpeg.org/download.html),
  unzip it, and add its `bin` folder to your system PATH. Confirm it works by
  opening a new Command Prompt and running `ffmpeg -version`.

#### Webcam permissions (Windows)

Windows can block apps from using the camera. Go to Settings > Privacy &
security > Camera, and make sure "Camera access" is on and "Let desktop apps
access your camera" is also on.

## Project files

```
models/              Exported Teachable Machine model files
  model.json
  weights.bin
  metadata.json
src/
  main.js            Entry point, wires everything together
  motionWatcher.js    Captures webcam frames and detects a settled item
  classifier.js       Loads the model and classifies a captured frame
  arduino.js           Where you send the 1/0 result to your Arduino
  server.js            Status page and live camera feed
package.json
```

## Setup

1. Make sure your Teachable Machine export files are in the `models` folder:
   `models/model.json`, `models/weights.bin`, `models/metadata.json`.

2. Install dependencies:

   ```
   npm install
   ```

3. Find your camera's device identifier.

   On Linux, list video devices with:

   ```
   ls /dev/video*
   ```

   Some webcams show up as more than one device (e.g. `/dev/video0` and
   `/dev/video2`) where only one of them actually streams video. If the
   default doesn't work, try the other indexes.

   On Windows, list camera names with:

   ```
   ffmpeg -list_devices true -f dshow -i dummy
   ```

   Look for your camera's name under "DirectShow video devices".

4. By default the app uses `/dev/video0` on Linux. If that's wrong, or you're
   on Windows, set the `CAMERA_DEVICE` environment variable to the value you
   found above before starting the app, for example:

   Linux:

   ```
   CAMERA_DEVICE=/dev/video2 npm start
   ```

   Windows (PowerShell):

   ```
   $env:CAMERA_DEVICE="Integrated Webcam"; npm start
   ```

## Running

Start the app with:

```
npm start
```

Make sure the bin is empty when you start the app. The first couple of
seconds are used to capture a reference image of the empty bin, which is how
it later tells that something has been placed in front of it.

This will:

- load the AI model
- start the web server (default `http://localhost:3000`)
- start watching the webcam

You should see:

```
Model loaded. Labels: [ 'Recyclable', 'Non-Recyclable' ]
Watching camera "/dev/video0" for objects...
Background reference captured.
```

When an item is placed and settles in front of the camera, you'll see:

```
Object settled, classifying...
{ label: 'Recyclable', confidence: 0.98, value: 1 }
```

## Live feed

While the app is running, open `http://localhost:3000/` in a browser to see
a live view of what the camera sees. This is useful for checking the
camera's framing and for tuning the detection settings below.

## Checking status

```
curl http://localhost:3000/status
```

This returns the most recent classification result and when it happened.

## Connecting to the Arduino

`src/arduino.js` sends the classification result to the Arduino over a
serial connection using the `serialport` npm package. It writes the value
(`1` for recyclable or `0` for non-recyclable) as an ASCII digit followed by
a newline, e.g. `"1\n"`, so it can be read on the Arduino side with
`Serial.parseInt()` or similar.

By default it connects to `/dev/ttyUSB0` on Linux or `COM3` on Windows at
9600 baud. Override these with environment variables if needed:

```
ARDUINO_PORT=/dev/ttyACM0 ARDUINO_BAUD_RATE=9600 npm start
```

## Configuration

A few things you may want to tune, found near the top of the relevant files:

- `src/main.js`: `CAMERA_DEVICE` - which camera to use. Can also be set with
  the `CAMERA_DEVICE` environment variable (see Setup above).
- `src/motionWatcher.js`:
  - `PRESENCE_THRESHOLD` - how different a frame must be from the empty-bin
    reference to count as "something is there". Lower this if small/dark
    items aren't being detected; raise it if it triggers on shadows or
    lighting changes.
  - `STILLNESS_THRESHOLD` - how little a frame may change from the previous
    one to count as "not moving anymore".
  - `STABLE_FRAMES_NEEDED` - how many consecutive present-and-still frames
    are needed before triggering a classification.
  - `EMPTY_FRAMES_TO_RESET` - how many consecutive empty frames are needed
    before the app is ready to detect the next item.
  - `BACKGROUND_ADAPT_RATE` - how quickly the empty-bin reference drifts to
    match slow lighting changes over time.
- `src/server.js`: `PORT` - the port for the web server. Can also be set with
  the `PORT` environment variable.

## Troubleshooting

General:

- If the app cannot open the webcam, confirm no other application (browser
  tab, video call, etc.) is currently using it.
- If nothing ever triggers, open the live feed (see above) to confirm the
  camera is actually pointed at the right spot and the image looks correct.
- If it never triggers but the live feed looks fine, try lowering
  `PRESENCE_THRESHOLD` in `src/motionWatcher.js`.
- If it triggers on its own with nothing there, something (lighting flicker,
  a moving shadow) is being read as an object; try raising
  `PRESENCE_THRESHOLD`.
- If classification results seem wrong or flipped, double check
  `models/metadata.json` to confirm the label order matches what
  `src/classifier.js` expects (`Recyclable` maps to `1`, everything else
  maps to `0`).
- If results seem consistently wrong for both item types, the app may have
  captured its empty-bin reference while something was already in view.
  Restart it with the bin actually empty.

Linux specific:

- If the app cannot open the webcam, confirm your user has permission to
  access the camera device (see Webcam permissions above).
- If `ffmpeg` immediately exits or errors about the device, double check the
  device path with `ls /dev/video*`, and try each one, since some webcams
  expose extra `/dev/videoN` entries that aren't the actual video stream.

Windows specific:

- If the app cannot open the webcam, check Settings > Privacy & security >
  Camera and make sure desktop apps are allowed to use it.
- If `ffmpeg` errors that it can't find the device, double check the exact
  camera name with `ffmpeg -list_devices true -f dshow -i dummy` and make
  sure `CAMERA_DEVICE` matches it exactly, including capitalization and
  spacing.
- If `ffmpeg` is not recognized as a command, confirm it was added to your
  system PATH and open a new terminal window after installing it.
