/****************************************************************************
 * uiIndex.js
 * openacousticdevices.info
 * November 2019
 *****************************************************************************/

'use strict';

/* global document */

const {ipcRenderer} = require('electron');

const audiomoth = require('audiomoth-hid');
const packetReader = require('./packetReader.js');

const util = require('util');
const electron = require('electron');
const {dialog, Menu, clipboard, BrowserWindow} = require('@electron/remote');

const ui = require('./ui.js');
const scheduleBar = require('./scheduleBar.js');
const saveLoad = require('./saveLoad.js');
const timeHandler = require('./timeHandler.js');
const lifeDisplay = require('./lifeDisplay.js');

const constants = require('./constants.js');

const uiSchedule = require('./schedule/uiSchedule.js');
const uiSettings = require('./settings/uiSettings.js');

const versionChecker = require('./versionChecker.js');

const THRESHOLD_SCALE_PERCENTAGE = 0;
const THRESHOLD_SCALE_16BIT = 1;
const THRESHOLD_SCALE_DECIBEL = 2;

const MILLISECONDS_IN_SECOND = 1000;

/* UI components */

const applicationMenu = Menu.getApplicationMenu();

const idDisplay = document.getElementById('id-display');
const idLabel = document.getElementById('id-label');

const firmwareVersionDisplay = document.getElementById('firmware-version-display');
const firmwareVersionLabel = document.getElementById('firmware-version-label');
const firmwareDescriptionDisplay = document.getElementById('firmware-description-display');
const firmwareDescriptionLabel = document.getElementById('firmware-description-label');

const batteryDisplay = document.getElementById('battery-display');
const batteryLabel = document.getElementById('battery-label');

const ledCheckbox = document.getElementById('led-checkbox');
const batteryLevelCheckbox = document.getElementById('battery-level-checkbox');

const configureButton = document.getElementById('configure-button');

/* Store version number for packet size checks and description for compatibility check */

let firmwareVersion = '0.0.0';

let firmwareDescription = '-';

/* If the ID of the current device differs from the previous one, then warning messages can be reset */

let previousID = '';

/* Indicate whether the firmware should be updated */

let updateRecommended = false;

/* Whether or not a warning about the version number has been displayed for this device */

let versionWarningShown = false;

/* Whether or not a warning about the firmware has been displayed for this device */

let firmwareWarningShown = false;

/* Whether or not communication with device is currently happening */

let communicating = false;

/* Communication constants */

const MAXIMUM_RETRIES = 10;
const DEFAULT_RETRY_INTERVAL = 100;

/* Compare two semantic versions and return true if older */

function isOlderSemanticVersion (aVersion, bVersion) {

    for (let i = 0; i < aVersion.length; i++) {

        const aVersionNum = parseInt(aVersion[i]);
        const bVersionNum = parseInt(bVersion[i]);

        if (aVersionNum > bVersionNum) {

            return false;

        } else if (aVersionNum < bVersionNum) {

            return true;

        }

    }

    return false;

}

/* Utility functions */

async function callWithRetry (funcSync, argument, milliseconds, repeats) {

    let result;

    let attempt = 0;

    while (attempt < repeats) {

        try {

            if (argument) {
                
                result = await funcSync(argument);

            } else {

                result = await funcSync();

            }

            break;

        } catch (e) {

            const interval = milliseconds / 2 + milliseconds / 2 * Math.random();

            await delay(interval);

            attempt += 1;

        }

    }

    if (result === undefined) throw ('Error: Repeated attempts to access the device failed.');

    if (result === null) throw ('No device detected');

    return result;

}

async function delay (milliseconds) {

    return new Promise(resolve => setTimeout(resolve, milliseconds));

}

/* Promisified versions of AudioMoth-HID calls */

const getFirmwareDescription = util.promisify(audiomoth.getFirmwareDescription);

const getFirmwareVersion = util.promisify(audiomoth.getFirmwareVersion);

const getBatteryState = util.promisify(audiomoth.getBatteryState);

const getID = util.promisify(audiomoth.getID);

const getTime = util.promisify(audiomoth.getTime);

const setPacket = util.promisify(audiomoth.setPacket);

/* Device interaction functions */

async function getAudioMothPacket () {

    try {

        /* Read from AudioMoth */

        const date = await callWithRetry(getTime, null, DEFAULT_RETRY_INTERVAL, MAXIMUM_RETRIES);

        const id = await callWithRetry(getID, null, DEFAULT_RETRY_INTERVAL, MAXIMUM_RETRIES);

        const description = await callWithRetry(getFirmwareDescription, null, DEFAULT_RETRY_INTERVAL, MAXIMUM_RETRIES);

        const versionArr = await callWithRetry(getFirmwareVersion, null, DEFAULT_RETRY_INTERVAL, MAXIMUM_RETRIES);

        const batteryState = await callWithRetry(getBatteryState, null, DEFAULT_RETRY_INTERVAL, MAXIMUM_RETRIES);

        /* No exceptions have occurred so update display */
        if (id !== previousID) {

            firmwareWarningShown = false;

            versionWarningShown = false;

            previousID = id;

        }

        firmwareVersion = versionArr[0] + '.' + versionArr[1] + '.' + versionArr[2];

        firmwareDescription = description;

        const supported = checkVersionCompatibility();

        if (communicating === false) {
            
            ui.updateDate(date);

            ui.showTime();
            
            enableDisplay();

        }

        if (supported === false) configureButton.disabled = true;

        updateIdDisplay(id);

        updateFirmwareDisplay(firmwareVersion, firmwareDescription);

        updateBatteryDisplay(batteryState);

    } catch (e) {

        /* Problem reading from AudioMoth or no AudioMoth */

        disableDisplay();

    }

    const milliseconds = Date.now() % MILLISECONDS_IN_SECOND;

    let delay = MILLISECONDS_IN_SECOND / 2 - milliseconds;

    if (delay < 0) delay += MILLISECONDS_IN_SECOND;

    setTimeout(getAudioMothPacket, delay);

}

function getEquivalentVersion (desc) {

    const foundEquivalence = desc.match(constants.EQUIVALENCE_REGEX)[0];

    const regex1 = /[0-9]+/g;
    const equivalentVersionStrArray = foundEquivalence.match(regex1);
    const equivalentVersionArray = [parseInt(equivalentVersionStrArray[0]), parseInt(equivalentVersionStrArray[1]), parseInt(equivalentVersionStrArray[2])];

    return equivalentVersionArray;

}

/* Check the version and description to see if the firmware is compatible or equivalent to an equivalent version of firmware */

function checkVersionCompatibility () {

    /* This version array may be replaced if the firmware is custom with an equivalent official version */

    let trueVersionArr = firmwareVersion.split('.');

    const classification = constants.getFirmwareClassification(firmwareDescription);

    let versionWarningText, versionWarningTitle;

    switch (classification) {

    case constants.FIRMWARE_CUSTOM:
        
        break;

    case constants.FIRMWARE_UNSUPPORTED:

        updateRecommended = false;

        if (firmwareWarningShown === false) {

            firmwareWarningShown = true;
            
            setTimeout(function () {

                dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
                    type: 'warning',
                    title: 'Unsupported firmware',
                    message: 'The firmware installed on your AudioMoth is not supported by the AudioMoth Configuration App.  This is a custom configuration app for custom Audiomoth-DualGain firmware and does not support the official release or other custom firmware'


                });

            }, 100);

        }

        return false;

    }

    /* If OFFICIAL_RELEASE, OFFICIAL_RELEASE_CANDIDATE or CUSTOM_EQUIVALENT */

    if (isOlderSemanticVersion(trueVersionArr, constants.latestFirmwareVersionArray)) {

        if (classification === constants.FIRMWARE_OFFICIAL_RELEASE || classification === constants.FIRMWARE_OFFICIAL_RELEASE_CANDIDATE) updateRecommended = true;

        if (versionWarningShown === false) {

            versionWarningShown = true;

            setTimeout(function () {

                dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
                    type: 'warning',
                    title: versionWarningTitle,
                    message: versionWarningText
                });

            }, 100);

        }

    } else {

        updateRecommended = false;

    }

    return true;

}

/* Write bytes into a buffer for transmission */

function writeLittleEndianBytes (buffer, start, byteCount, value) {

    for (let i = 0; i < byteCount; i++) {

        buffer[start + i] = (value >> (i * 8)) & 255;

    }

}

function getTrueFirmwareVersion () {

    let trueFirmwareVersion = firmwareVersion.split('.');

    /* Check for equivalent if using custom firmware */

    const classification = constants.getFirmwareClassification(firmwareDescription);

    if (classification === constants.FIRMWARE_CUSTOM_EQUIVALENT) {

        trueFirmwareVersion = getEquivalentVersion(firmwareDescription);

        console.log('Treating firmware as equivalent version: ' + trueFirmwareVersion[0] + '.' + trueFirmwareVersion[1] + '.' + trueFirmwareVersion[2]);

    }

    /* Use latest version if custom */

    if (classification === constants.FIRMWARE_UNSUPPORTED) {

        trueFirmwareVersion = constants.latestFirmwareVersionArray;

        console.log('Unsupported firmware, treating firmware as latest version');

    }

    return trueFirmwareVersion;

}

/* Send configuration packet to AudioMoth */

async function sendAudioMothPacket (packet) {

    const showError = () => {

        dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'error',
            title: 'Configuration failed',
            message: 'The connected AudioMoth did not respond correctly and the configuration may not have been applied. Please try again.'
        });

        configureButton.classList.remove('grey');

    };

    try {

        const data = await callWithRetry(setPacket, packet, DEFAULT_RETRY_INTERVAL, MAXIMUM_RETRIES);

        /* Check if the firmware version of the device being configured has a known packet length */
        /* If not, the length of the packet sent/received is used */

        let packetLength = Math.min(packet.length, data.length - 1);

        const trueFirmwareVersion = getTrueFirmwareVersion();

        for (let k = 0; k < constants.packetLengthVersions.length; k++) {

            const possibleFirmwareVersion = constants.packetLengthVersions[k].firmwareVersion;

            if (isOlderSemanticVersion(trueFirmwareVersion, possibleFirmwareVersion.split('.'))) {

                break;

            }

            packetLength = constants.packetLengthVersions[k].packetLength;

        }

        console.log('Using packet length', packetLength);

        /* Verify the packet sent was read correctly by the device by comparing it to the returned packet */

        let matches = true;

        for (let j = 0; j < packetLength; j++) {

            if (packet[j] !== data[j + 1]) {

                console.log('(' + j + ')  ' + packet[j] + ' - ' + data[j + 1]);

                matches = false;

                break;

            }

        }

        if (matches === false) throw ('Packet does not match');

    } catch (e) {

        showError();

    }

}

function configureDevice () {

    ui.disableTimeDisplay();

    const USB_LAG = 20;

    const MINIMUM_DELAY = 100;

    console.log('Configuring device');

    const settings = uiSettings.getSettings();

    /* Build configuration packet */

    let index = 0;

    /* Packet length is only increased with updates, so take the size of the latest firmware version packet */

    const maxPacketLength = constants.packetLengthVersions.slice(-1)[0].packetLength;

    const packet = new Uint8Array(maxPacketLength);

    /* Increment to next second transition */

    const sendTime = new Date();

    let delay = constants.MILLISECONDS_IN_SECOND - sendTime.getMilliseconds() - USB_LAG;

    if (delay < MINIMUM_DELAY) delay += constants.MILLISECONDS_IN_SECOND;

    sendTime.setMilliseconds(sendTime.getMilliseconds() + delay);

    /* Make the data packet */

    writeLittleEndianBytes(packet, index, 4, Math.round(sendTime.valueOf() / 1000));
    index += 4;

    packet[index++] = settings.gain1;
     
    packet[index++] = settings.gain2;
    
    packet[index++] = settings.gain3;
    

    /* If equivalent firmware or unsupported firmware is present, use correct firmware version */

    const trueFirmwareVersion = getTrueFirmwareVersion();

    const configurations = (isOlderSemanticVersion(trueFirmwareVersion, ['1', '4', '5']) && settings.sampleRateIndex < 3) ? constants.oldConfigurations : constants.configurations;

    const sampleRateConfiguration = configurations[settings.sampleRateIndex];

    packet[index++] = sampleRateConfiguration.clockDivider;

    packet[index++] = sampleRateConfiguration.acquisitionCycles;

    packet[index++] = sampleRateConfiguration.oversampleRate;

    writeLittleEndianBytes(packet, index, 4, sampleRateConfiguration.sampleRate);
    index += 4;

    packet[index++] = sampleRateConfiguration.sampleRateDivider;

    writeLittleEndianBytes(packet, index, 2, settings.sleepDuration);
    index += 2;

    writeLittleEndianBytes(packet, index, 2, settings.sleepDurationBetweenGains);
    index += 2;

    writeLittleEndianBytes(packet, index, 2, settings.sleepDurationBetweenGains3);
    index += 2;

    writeLittleEndianBytes(packet, index, 2, settings.recordDurationGain1);
    index += 2;

    writeLittleEndianBytes(packet, index, 2, settings.recordDurationGain2);
    index += 2;

    writeLittleEndianBytes(packet, index, 2, settings.recordDurationGain3);
    index += 2;
 
    // all bools here, into Byte 22

    let packedByte0 = ledCheckbox.checked & 0b1;
    /* Low voltage cutoff is always enabled */
    packedByte0 |= (1 & 0b1) << 1;
    packedByte0 |= (batteryLevelCheckbox.checked & 0b1 ) << 2;
    packedByte0 |= (settings.dutyEnabled & 0b1 ) << 3; //Duty cycle disabled (default value = 0) 
    /* Whether to use NiMH/LiPo voltage range for battery level indication */
    packedByte0 |= (settings.energySaverModeEnabled & 0b1 ) << 4; 
    /* Whether to turn off the 48Hz DC blocking filter which is on by default */
    packedByte0 |= (settings.disable48DCFilter & 0b1 ) << 5;
    /* Whether to create a new folder each day to store files */
    packedByte0 |= (settings.dailyFolders & 0b1 ) << 7;
    packet[index++] = packedByte0;

    let timePeriods;

    if (isOlderSemanticVersion(trueFirmwareVersion, ['1', '9', '0'])) {

        /* If AudioMoth is using a firmware version older than 1.9.0, split any periods which wrap around */

        timePeriods = JSON.parse(JSON.stringify(scheduleBar.getTimePeriodsNoWrap()));

    } else {

        timePeriods = JSON.parse(JSON.stringify(scheduleBar.getTimePeriods()));

    }

    timePeriods = timeHandler.sortPeriods(timePeriods);

    packet[index++] = timePeriods.length;

    for (let i = 0; i < timePeriods.length; i++) {

        writeLittleEndianBytes(packet, index, 2, timePeriods[i].startMins);
        index += 2;

        const endMins = timePeriods[i].endMins === 0 ? 1440 : timePeriods[i].endMins;
        writeLittleEndianBytes(packet, index, 2, endMins);
        index += 2;

    }

    for (let i = 0; i < (scheduleBar.MAX_PERIODS + 1) - timePeriods.length; i++) {

        writeLittleEndianBytes(packet, index, 2, 0);
        index += 2;

        writeLittleEndianBytes(packet, index, 2, 0);
        index += 2;

    }

    const timeZoneOffset = timeHandler.getTimeZoneOffset();

    const offsetHours = timeZoneOffset < 0 ? Math.ceil(timeZoneOffset / constants.MINUTES_IN_HOUR) : Math.floor(timeZoneOffset / constants.MINUTES_IN_HOUR);

    const offsetMins = timeZoneOffset % constants.MINUTES_IN_HOUR;

    packet[index++] = offsetHours;

    /* For non-integer timeZones */

    packet[index++] = offsetMins;

    /* Start/stop dates */

    const firstRecordingDateEnabled = uiSchedule.isFirstRecordingDateEnabled();

    let earliestRecordingTime = 0;

    if (firstRecordingDateEnabled) {

        const dateComponents = ui.extractDateComponents(uiSchedule.getFirstRecordingDate());

        const firstRecordingTimestamp = Date.UTC(dateComponents.year, dateComponents.month - 1, dateComponents.day, 0, 0, 0, 0).valueOf() / 1000;

        const firstRecordingOffsetTimestamp = firstRecordingTimestamp - timeZoneOffset * constants.SECONDS_IN_MINUTE;

        earliestRecordingTime = firstRecordingOffsetTimestamp;

    }

    const lastRecordingDateEnabled = uiSchedule.isLastRecordingDateEnabled();

    let latestRecordingTime = 0;

    if (lastRecordingDateEnabled) {

        const dateComponents = ui.extractDateComponents(uiSchedule.getLastRecordingDate());

        const lastRecordingTimestamp = Date.UTC(dateComponents.year, dateComponents.month - 1, dateComponents.day, 0, 0, 0, 0).valueOf() / 1000;

        const lastRecordingOffsetTimestamp = lastRecordingTimestamp + constants.SECONDS_IN_DAY - timeZoneOffset * constants.SECONDS_IN_MINUTE;

        latestRecordingTime = lastRecordingOffsetTimestamp;

    }

    /* Check ranges of values before sending */

    earliestRecordingTime = Math.min(constants.UINT32_MAX, earliestRecordingTime);
    latestRecordingTime = Math.min(constants.UINT32_MAX, latestRecordingTime);

    writeLittleEndianBytes(packet, index, 4, earliestRecordingTime);
    index += 4;

    writeLittleEndianBytes(packet, index, 4, latestRecordingTime);
    index += 4;
    
    let packedByte1 = settings.requireAcousticConfig & 0b1;
    packedByte1 |= (settings.displayVoltageRange & 0b1) << 1;
    packet[index++] = packedByte1;

    console.log('Packet length: ', index); //expect 50 in DualGain configuration app

    /* Send packet to device */

    console.log('Sending packet:');

    console.log(packet);

    packetReader.read(packet);

    const now = new Date();

    const sendTimeDiff = sendTime.getTime() - now.getTime();

    /* Calculate when to re-enable time display */

    communicating = true;

    configureButton.disabled = true;

    const updateDelay = sendTimeDiff <= 0 ? MILLISECONDS_IN_SECOND : sendTimeDiff;

    setTimeout(function () {

        communicating = false;

    }, updateDelay);

    /* Either send immediately or wait until the transition */

    if (sendTimeDiff <= 0) {

        console.log('Sending...');

        sendAudioMothPacket(packet);

    } else {

        console.log('Sending in', sendTimeDiff);

        setTimeout(function () {

            sendAudioMothPacket(packet);

        }, sendTimeDiff);

    }

}

/* Initialise device information displays */

function initialiseDisplay () {


    ui.showTime();

    idDisplay.textContent = '-';

    batteryDisplay.textContent = '-';

    firmwareVersionDisplay.textContent = '-';

    firmwareDescriptionDisplay.textContent = '-';

}

/* Disable/enable device information display */

function disableDisplay () {

    ui.disableTimeDisplay();

    idLabel.classList.add('grey');
    idDisplay.classList.add('grey');
    firmwareVersionLabel.classList.add('grey');
    firmwareVersionDisplay.classList.add('grey');
    firmwareDescriptionLabel.classList.add('grey');
    firmwareDescriptionDisplay.classList.add('grey');
    batteryLabel.classList.add('grey');
    batteryDisplay.classList.add('grey');

    configureButton.disabled = true;

};

function enableDisplay () {

    idLabel.classList.remove('grey');
    idDisplay.classList.remove('grey');
    firmwareVersionLabel.classList.remove('grey');
    firmwareVersionDisplay.classList.remove('grey');
    firmwareDescriptionLabel.classList.remove('grey');
    firmwareDescriptionDisplay.classList.remove('grey');
    batteryLabel.classList.remove('grey');
    batteryDisplay.classList.remove('grey');

    configureButton.disabled = false;

    ui.enableTimeDisplay();

};

/* Insert retrieved values into device information display */

function updateIdDisplay (deviceId) {

    applicationMenu.getMenuItemById('copyid').enabled = true;

    idDisplay.textContent = deviceId;

};

function updateFirmwareDisplay (version, description) {

    firmwareVersionDisplay.textContent = version;

    if (updateRecommended) {

        firmwareVersionDisplay.textContent += ' (Update recommended)';

    }

    firmwareDescriptionDisplay.textContent = description;

};

function updateBatteryDisplay (battery) {

    batteryDisplay.textContent = battery;

};

function copyDeviceID () {

    const id = idDisplay.textContent;

    clipboard.writeText(id);

    idDisplay.style.color = 'green';

    setTimeout(function () {

        idDisplay.style.color = '';

    }, 2000);

}

electron.ipcRenderer.on('copy-id', copyDeviceID);

function changeTimeZoneStatus (mode) {

    ui.setTimeZoneStatus(mode);

    uiSchedule.updateTimeZoneStatus(mode);

    ui.updateTimeZoneUI();

}

function toggleNightMode () {

    ui.toggleNightMode();

}

function updateLifeDisplayOnChange () {

    let sortedPeriods = JSON.parse(JSON.stringify(scheduleBar.getTimePeriods()));
    sortedPeriods = sortedPeriods.sort(function (a, b) {

        return a.startMins - b.startMins;

    });

    const settings = uiSettings.getSettings();

    lifeDisplay.updateLifeDisplay(sortedPeriods, constants.configurations[settings.sampleRateIndex], settings.recordDurationGain1, settings.sleepDuration, settings.dutyEnabled, settings.energySaverModeEnabled );

}

lifeDisplay.getPanel().addEventListener('click', () => {

    lifeDisplay.toggleSizeWarning(updateLifeDisplayOnChange);

});

function getCurrentConfiguration () {

    const config = {};

    const timePeriods = scheduleBar.getTimePeriodsNoWrap();

    for (let i = 0; i < timePeriods.length; i++) {

        timePeriods[i].startMins = timePeriods[i].startMins === 0 ? 0 : timePeriods[i].startMins;
        timePeriods[i].endMins = timePeriods[i].endMins === 0 ? 1440 : timePeriods[i].endMins;

    }

    config.timePeriods = timePeriods;

    config.customTimeZoneOffset = ipcRenderer.sendSync('request-custom-time-zone');

    config.localTime = ui.getTimeZoneMode() === constants.TIME_ZONE_MODE_LOCAL;

    config.ledEnabled = ledCheckbox.checked;
    config.batteryLevelCheckEnabled = batteryLevelCheckbox.checked;

    const settings = uiSettings.getSettings();

    config.sampleRateIndex = settings.sampleRateIndex;
    config.gain1 = settings.gain1;
    config.gain2 = settings.gain2;
    config.gain3 = settings.gain3;
    config.recordDurationGain1 = settings.recordDurationGain1;
    config.recordDurationGain2 = settings.recordDurationGain2;
    config.recordDurationGain3 = settings.recordDurationGain3;
    config.sleepDuration = settings.sleepDuration;
    config.sleepDurationBetweenGains = settings.sleepDurationBetweenGains;
    config.sleepDurationBetweenGains3 = settings.sleepDurationBetweenGains3;
    config.dutyEnabled = settings.dutyEnabled;

    config.firstRecordingDateEnabled = uiSchedule.isFirstRecordingDateEnabled();
    config.lastRecordingDateEnabled = uiSchedule.isLastRecordingDateEnabled();

    config.firstRecordingDate = uiSchedule.getFirstRecordingDate();
    config.lastRecordingDate = uiSchedule.getLastRecordingDate();

    config.requireAcousticConfig = settings.requireAcousticConfig;

    config.dailyFolders = settings.dailyFolders;

    config.displayVoltageRange = settings.displayVoltageRange;

    config.energySaverModeEnabled = settings.energySaverModeEnabled;

    config.disable48DCFilter = settings.disable48DCFilter;

    return config;

}

/* Add listeners to save/load menu options */

electron.ipcRenderer.on('save', () => {

    const currentConfig = getCurrentConfiguration();

    saveLoad.saveConfiguration(currentConfig, (err) => {

        if (err) {

            console.error(err);

        } else {

            console.log('Config saved');

        }

    });

});

electron.ipcRenderer.on('load', () => {

    const currentConfig = getCurrentConfiguration();

    saveLoad.loadConfiguration(currentConfig, (timePeriods, ledEnabled, batteryLevelCheckEnabled, sampleRateIndex, gain1, gain2, gain3,  dutyEnabled, sleepDuration, sleepDurationBetweenGains, sleepDurationBetweenGains3, recordDurationGain1, recordDurationGain2, recordDurationGain3, localTime, customTimeZoneOffset, firstRecordingDateEnabled, firstRecordingDate, lastRecordingDateEnabled, lastRecordingDate, requireAcousticConfig, displayVoltageRange, energySaverModeEnabled, disable48DCFilter, dailyFolders) => {

        document.activeElement.blur();

        let sortedPeriods = timePeriods;
        sortedPeriods = sortedPeriods.sort(function (a, b) {

            return a.startMins - b.startMins;

        });

        let timeZoneMode;

        if (localTime) {

            timeZoneMode = constants.TIME_ZONE_MODE_LOCAL;

        } else if (customTimeZoneOffset) {

            timeZoneMode = constants.TIME_ZONE_MODE_CUSTOM;

        } else {

            timeZoneMode = constants.TIME_ZONE_MODE_UTC;

        }

        changeTimeZoneStatus(timeZoneMode);

        if (timeZoneMode === constants.TIME_ZONE_MODE_CUSTOM) {

            electron.ipcRenderer.send('set-custom-time-zone', customTimeZoneOffset);

        } else {

            electron.ipcRenderer.send('set-time-zone-menu', timeZoneMode);

        }

        uiSchedule.clearTimes();

        for (let i = 0; i < sortedPeriods.length; i++) {

            uiSchedule.addTime(sortedPeriods[i].startMins, sortedPeriods[i].endMins);

        }

        scheduleBar.updateCanvas();

        uiSchedule.updateTimeList();

        let todayString;

        if (firstRecordingDate === '' || lastRecordingDate === '') {

            let today = new Date();
            const todayTimestamp = today.valueOf();
            const timeZoneOffset = timeHandler.getTimeZoneOffset() * constants.SECONDS_IN_MINUTE * 1000;

            const todayOffsetTimestamp = todayTimestamp + timeZoneOffset;

            today = new Date(todayOffsetTimestamp);

            todayString = ui.formatDateString(today);

        }

        firstRecordingDate = firstRecordingDate === '' ? todayString : firstRecordingDate;
        lastRecordingDate = lastRecordingDate === '' ? todayString : lastRecordingDate;

        uiSchedule.setFirstRecordingDate(firstRecordingDateEnabled, firstRecordingDate);
        uiSchedule.setLastRecordingDate(lastRecordingDateEnabled, lastRecordingDate);

        const settings = {
            sampleRateIndex,
            gain1,
            gain2,
            gain3,
            dutyEnabled,
            recordDurationGain1,
            recordDurationGain2,
            recordDurationGain3,
            sleepDuration,
            sleepDurationBetweenGains,
            sleepDurationBetweenGains3,
            dailyFolders,
            displayVoltageRange,
            energySaverModeEnabled,
            disable48DCFilter,
        };

        uiSettings.fillUI(settings);

        ledCheckbox.checked = ledEnabled;
        batteryLevelCheckbox.checked = batteryLevelCheckEnabled;
        uiSettings.updateVoltageRangeStatus();

        ui.update();

        updateLifeDisplayOnChange();

    });

});

electron.ipcRenderer.on('update-check', () => {

    versionChecker.checkLatestRelease(function (response) {

        if (response.error) {

            console.error(response.error);

            dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
                type: 'error',
                title: 'Failed to check for updates',
                message: response.error
            });

            return;

        }

        if (response.updateNeeded === false) {

            dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
                type: 'info',
                buttons: ['OK'],
                title: 'Update not needed',
                message: 'Your app is on the latest version (' + response.latestVersion + ').'
            });

            return;

        }

        const buttonIndex = dialog.showMessageBoxSync({
            type: 'warning',
            buttons: ['Yes', 'No'],
            title: 'Download newer version',
            message: 'A newer version of this app is available (' + response.latestVersion + '), would you like to download it?'
        });

        if (buttonIndex === 0) {

            electron.shell.openExternal('https://www.openacousticdevices.info/applications');

        }

    });

});

/* Prepare UI */

idDisplay.addEventListener('click', copyDeviceID);

disableDisplay();
initialiseDisplay();

getAudioMothPacket();

ui.setTimeZoneStatus(ui.getTimeZoneMode());
ui.updateTimeZoneUI();

electron.ipcRenderer.on('night-mode', toggleNightMode);

electron.ipcRenderer.on('change-time-zone-mode', (e, timeZoneMode) => {

    changeTimeZoneStatus(timeZoneMode);

});

configureButton.addEventListener('click', () => {

    const timePeriods = scheduleBar.getTimePeriods();

    if (timePeriods.length === 0) {

        const buttonIndex = dialog.showMessageBoxSync({
            type: 'warning',
            buttons: ['Yes', 'No'],
            title: 'No recording periods',
            message: 'No recording periods have been scheduled. This means the AudioMoth will not record when in CUSTOM mode. Are you sure you wish to apply this configuration?'
        });

        if (buttonIndex === 1) {

            console.log('Configuration cancelled');

            return;

        }

    }

    configureDevice();

});

uiSchedule.prepareUI(updateLifeDisplayOnChange);
uiSettings.prepareUI(updateLifeDisplayOnChange);
