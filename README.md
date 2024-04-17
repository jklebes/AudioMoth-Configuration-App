# AudioMoth Configuration App - Dual Gain #
An Electron-based application capable of configuring the functionality of the AudioMoth recording device and setting the onboard clock.

For more details on the device itself, visit [www.openacousticdevices.info](http://www.openacousticdevices.info).

This fork works with the custom firmware DualGain 1.0.1 https://github.com/jklebes/AudioMoth-DualGain only.  It will only configure devices with firmware with name ``"AudioMoth-DualGain"``, not the standard releases.  It allows setting of two gain levels and timing in a sleep - gain1 - delay - gain2 schedule.  Functions not needed on our project, namely GPS time setting, magnetic switch, filters, and triggered recordings, are removed from the UI.

### Usage ###
Once the repository has been cloned, install all required dependencies with:
```
npm install
```
Note: requires sufficiently recent version of nodejs, more recent than available on debian repositories.

From then onwards, start the application with:
```
npm run start 
```

Note: this currently gets an error message and warning ``Failed to fetch devtools://devtools/...``, this is a chronic electron bug but the app works.

Package the application into an installer for your current platform with:
```
npm run dist [win64/win32/mac/linux]
```

Note: build on windows requires developer mode is activated.  Requires working in a local (not mounted) file system.  

This will place a packaged version of the app and an installer for the platform this command was run on into the `/dist` folder. Note that to sign the binary in macOS you will need to run the command above as 'sudo'. The codesign application will retreive the appropriate certificate from Keychain Access.

For detailed usage instructions of the app itself and to download prebuilt installers of the latest stable version for all platforms, visit the app support site [here](http://www.openacousticdevices.info/config).

### Related Repositories ###
* [AudioMoth-HID](https://github.com/OpenAcousticDevices/AudioMoth-HID)
* [AudioMoth Time App](https://github.com/OpenAcousticDevices/AudioMoth-Time-App)

### License ###

Copyright 2017 [Open Acoustic Devices](http://www.openacousticdevices.info/).

[MIT license](http://www.openacousticdevices.info/license).
