/****************************************************************************
 * saveLoad.js
 * openacousticdevices.info
 * June 2017
 *****************************************************************************/

'use strict';

const {dialog, BrowserWindow, app} = require('@electron/remote');

const fs = require('fs');
const Validator = require('jsonschema').Validator;

const constants = require('./constants.js');
const ui = require('./ui.js');

const DEFAULT_SETTINGS = {
    timePeriods: [],
    ledEnabled: true,
    batteryLevelCheckEnabled: true,
    sampleRate: 48000,
    gain1: 2,
    gain2: 0,
    gain3: 0,
    recordDurationGain1: 55,
    recordDurationGain2: 55,
    recordDurationGain3: 55,
    sleepDuration: 5,
    sleepDurationBetweenGains: 0,
    sleepDurationBetweenGains3: 0,
    timeZoneMode: 'UTC',
    firstRecordingDateEnabled: false,
    lastRecordingDateEnabled: false,
    dutyEnabled: true,
    requireAcousticConfig: false,
    dailyFolders: false,
    displayVoltageRange: false,
    energySaverModeEnabled: false,
    disable48DCFilter: false,
};

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

/* Save configuration settings in UI to .config file */

function saveConfiguration (currentConfig, callback) {

    const sampleRate = constants.configurations[currentConfig.sampleRateIndex].trueSampleRate * 1000;

    const versionString = app.getVersion();

    let configuration = '{\r\n';
    configuration += '"timePeriods": ' + JSON.stringify(currentConfig.timePeriods) + ',\r\n';
    configuration += '"ledEnabled": ' + currentConfig.ledEnabled + ',\r\n';

    /* Low voltage cutoff is always enabled, include this line so files created by newer versions of the app have the same functionality when loaded in older versions */
    configuration += '"lowVoltageCutoffEnabled": ' + true + ',\r\n';

    configuration += '"batteryLevelCheckEnabled": ' + currentConfig.batteryLevelCheckEnabled + ',\r\n';
    configuration += '"sampleRate": ' + sampleRate + ',\r\n';
    configuration += '"gain1": ' + currentConfig.gain1 + ',\r\n';
    configuration += '"gain2": ' + currentConfig.gain2 + ',\r\n';
    configuration += '"gain3": ' + currentConfig.gain3 + ',\r\n';
    configuration += '"recordDurationGain1": ' + currentConfig.recordDurationGain1 + ',\r\n';
    configuration += '"recordDurationGain2": ' + currentConfig.recordDurationGain2 + ',\r\n';
    configuration += '"recordDurationGain3": ' + currentConfig.recordDurationGain3 + ',\r\n';
    configuration += '"sleepDuration": ' + currentConfig.sleepDuration + ',\r\n';
    configuration += '"sleepDurationBetweenGains": ' + currentConfig.sleepDurationBetweenGains + ',\r\n';
    configuration += '"sleepDurationBetweenGains3": ' + currentConfig.sleepDurationBetweenGains3 + ',\r\n';

    configuration += ui.getTimeZoneMode() === constants.TIME_ZONE_MODE_CUSTOM ? '"customTimeZoneOffset": ' + currentConfig.customTimeZoneOffset + ',\r\n' : '';

    configuration += '"localTime": ' + currentConfig.localTime + ',\r\n';

    configuration += '"firstRecordingDateEnabled": ' + currentConfig.firstRecordingDateEnabled + ',\r\n';
    configuration += '"lastRecordingDateEnabled": ' + currentConfig.lastRecordingDateEnabled + ',\r\n';

    configuration += currentConfig.firstRecordingDateEnabled ? '"firstRecordingDate": \"' + currentConfig.firstRecordingDate + '\",\r\n' : '';
    configuration += currentConfig.lastRecordingDateEnabled ? '"lastRecordingDate": \"' + currentConfig.lastRecordingDate + '\",\r\n' : '';

    configuration += '"dutyEnabled": ' + currentConfig.dutyEnabled + ',\r\n';
    configuration += '"requireAcousticConfig": ' + currentConfig.requireAcousticConfig + ',\r\n';
    configuration += '"dailyFolders": ' + currentConfig.dailyFolders + ',\r\n';
    configuration += '"displayVoltageRange": ' + currentConfig.displayVoltageRange + ',\r\n';
    configuration += '"version": \"' + versionString + '\",\r\n';
    configuration += '"energySaverModeEnabled": ' + currentConfig.energySaverModeEnabled + ',\r\n';
    configuration += '"disable48DCFilter": ' + currentConfig.disable48DCFilter + ',\r\n';
    configuration += '}';

    const fileName = dialog.showSaveDialogSync({
        title: 'Save configuration',
        nameFieldLabel: 'Configuration name',
        defaultPath: 'AudioMoth.config',
        filters: [{
            name: 'config',
            extensions: ['config']
        }]
    });

    if (fileName) {

        fs.writeFile(fileName, configuration, callback);

    }

}

exports.saveConfiguration = saveConfiguration;

/* Newer save files save the sample rate itself rather than the index, handle that by detecting empty JSON objects */

function getSampleRateIndex (jsonSampleRateIndex, jsonSampleRate, replacementSampleRate) {

    if (typeof jsonSampleRateIndex === 'undefined') {

        let sampleRate = jsonSampleRate;

        if (typeof jsonSampleRate === 'undefined') {

            sampleRate = replacementSampleRate;

        }

        sampleRate /= 1000;

        let minDistance = -1;
        let closestIndex = 0;

        for (let i = 0; i < constants.configurations.length; i++) {

            const distance = Math.abs(constants.configurations[i].trueSampleRate - sampleRate);

            if (minDistance === -1 || distance < minDistance) {

                minDistance = distance;
                closestIndex = i;

            }

        }

        return closestIndex;

    } else {

        return jsonSampleRateIndex;

    }

}

/* Take data obtained from a loaded .config file and duplicate settings in the UI */

function useLoadedConfiguration (err, currentConfig, data, callback) {

    if (err) {

        dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: 'error',
            title: 'Load failed',
            message: 'Configuration file could not be loaded.'
        });

        console.error(err);

    } else {

        /* Validate JSON */

        try {

            const jsonObj = JSON.parse(data);
            const validator = new Validator();
            const schema = {
                id: '/configuration',
                type: 'object',
                properties: {
                    timePeriods: {
                        type: 'array',
                        items: {
                            properties: {
                                startMins: {
                                    type: 'integer'
                                },
                                endMins: {
                                    type: 'integer'
                                }
                            },
                            required: ['startMins', 'endMins']
                        }
                    },
                    ledEnabled: {
                        type: 'boolean'
                    },
                    batteryCheckEnabled: {
                        type: 'boolean'
                    },
                    batteryLevelCheckEnabled: {
                        type: 'boolean'
                    },
                    sampleRateIndex: {
                        type: 'integer'
                    },
                    sampleRate: {
                        type: 'integer'
                    },
                    gainIndex: {
                        type: 'integer'
                    },
                    gain1: {
                        type: 'integer'
                    },
                    gain2: {
                        type: 'integer'
                    },
                    gain3: {
                        type: 'integer'
                    },
                    recDuration: {
                        type: 'integer'
                    },
                    recordDurationGain1: {
                        type: 'integer'
                    },
                    recordDurationGain2: {
                        type: 'integer'
                    },
                    recordDurationGain3: {
                        type: 'integer'
                    },
                    sleepDuration: {
                        type: 'integer'
                    },
                    sleepDurationBetweenGains: {
                        type: 'integer'
                    },
                    sleepDurationBetweenGains3: {
                        type: 'integer'
                    },
                    localTime: {
                        type: 'boolean'
                    },
                    customTimeZoneOffset: {
                        type: 'integer'
                    },
                    firstRecordingDateEnabled: {
                        type: 'boolean'
                    },
                    firstRecordingDate: {
                        type: 'string'
                    },
                    lastRecordingDateEnabled: {
                        type: 'boolean'
                    },
                    lastRecordingDate: {
                        type: 'string'
                    },
                    dutyEnabled: {
                        type: 'boolean'
                    },
                    dailyFolders: {
                        type: 'boolean'
                    },
                    displayVoltageRange: {
                        type: 'boolean'
                    },
                    version: {
                        type: 'string'
                    },
                    energySaverModeEnabled: {
                        type: 'boolean'
                    },
                    disable48DCFilter: {
                        type: 'boolean'
                    },
                },
                required: []
            };

            try {

                validator.validate(jsonObj, schema, {throwError: true});

            } catch (err) {

                console.error(err);
                throw new Error('JSON validation failed.');

            }

            console.log(jsonObj);

            /* Values to use if a setting is missing */

            let replacementValues = DEFAULT_SETTINGS;
            replacementValues.timePeriods = [];

            let isMissingValues = (typeof jsonObj.timePeriods === 'undefined');
            isMissingValues |= (typeof jsonObj.ledEnabled === 'undefined');
            isMissingValues |= (typeof jsonObj.batteryLevelCheckEnabled === 'undefined');
            isMissingValues |= (typeof jsonObj.gain1 === 'undefined');
            isMissingValues |= (typeof jsonObj.gain2 === 'undefined');
            isMissingValues |= (typeof jsonObj.gain3 === 'undefined');
            isMissingValues |= (typeof jsonObj.dutyEnabled === 'undefined');
            isMissingValues |= (typeof jsonObj.sleepDuration === 'undefined');
            isMissingValues |= (typeof jsonObj.sleepDurationBetweenGains === 'undefined');
            isMissingValues |= (typeof jsonObj.sleepDurationBetweenGains3 === 'undefined');
            isMissingValues |= (typeof jsonObj.recordDurationGain1 === 'undefined');
            isMissingValues |= (typeof jsonObj.recordDurationGain2 === 'undefined');
            isMissingValues |= (typeof jsonObj.recordDurationGain3 === 'undefined');
            isMissingValues |= (typeof jsonObj.dailyFolders === 'undefined');
            isMissingValues |= (typeof jsonObj.displayVoltageRange === 'undefined');
            isMissingValues |= (typeof jsonObj.minimumAmplitudeThresholdDuration === 'undefined');
            isMissingValues |= (typeof jsonObj.amplitudeThresholdScale === 'undefined');
            isMissingValues |= (typeof jsonObj.energySaverModeEnabled === 'undefined');
            isMissingValues |= (typeof jsonObj.disable48DCFilter === 'undefined');

            if (isMissingValues) {

                const buttonIndex = dialog.showMessageBoxSync({
                    type: 'warning',
                    buttons: ['Keep Current Settings', 'Set to Default'],
                    title: 'Configuration file with missing settings loaded',
                    message: 'This configuration file contains a subset of the full settings. Missing settings can either be set to their default values or keep their current values.',
                    cancelId: -1
                });

                if (buttonIndex === 0) {

                    replacementValues = currentConfig;

                } else if (buttonIndex === -1) {

                    console.log('Cancelled opening configuration file');
                    return;

                }

            }

            /* Don't open config files created by newer app versions */

            let version = (typeof jsonObj.version === 'undefined') ? '0.0.0' : jsonObj.version;
            const versionArray = version.split('.');

            const appVersionArray = app.getVersion().split('.');

            if (isOlderSemanticVersion(appVersionArray, versionArray)) {

                console.error('Cannot open configuration files created by future app versions');

                dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
                    type: 'error',
                    title: 'Incorrect format',
                    message: 'Cannot open the configuration file as it was created by a release of the AudioMoth Configuration App greater than ' + app.getVersion() + '.'
                });

                return;

            }

            const timePeriods = (typeof jsonObj.timePeriods === 'undefined') ? replacementValues.timePeriods : jsonObj.timePeriods;

            /* If startTime or endTime === 1440, read it as 0 */

            for (let i = 0; i < timePeriods.length; i++) {

                timePeriods[i].startMins = timePeriods[i].startMins === 1440 ? 0 : timePeriods[i].startMins;
                timePeriods[i].endMins = timePeriods[i].endMins === 1440 ? 0 : timePeriods[i].endMins;

            }

            const ledEnabled = (typeof jsonObj.ledEnabled === 'undefined') ? replacementValues.ledEnabled : jsonObj.ledEnabled;

            const batteryLevelCheckEnabled = (typeof jsonObj.batteryLevelCheckEnabled === 'undefined') ? replacementValues.batteryLevelCheckEnabled : jsonObj.batteryLevelCheckEnabled;

            const sampleRateIndex = getSampleRateIndex(jsonObj.sampleRateIndex, jsonObj.sampleRate, replacementValues.sampleRate);

            /* If gain is undefined, it's either missing and should be replaced, or using the old gainIndex name */

            let gain1 = (typeof jsonObj.gain1 === 'undefined') ? jsonObj.gainIndex : jsonObj.gain1;
            gain1 = (typeof gain1 === 'undefined') ? replacementValues.gain1 : gain1;
            let gain2 = (typeof jsonObj.gain2 === 'undefined') ? jsonObj.gainIndex : jsonObj.gain2;
            gain2 = (typeof gain2 === 'undefined') ? replacementValues.gain2 : gain2;
            let gain3 = (typeof jsonObj.gain3 === 'undefined') ? jsonObj.gainIndex : jsonObj.gain3;
            gain3 = (typeof gain3 === 'undefined') ? replacementValues.gain3 : gain3;

            const dutyEnabled = (typeof jsonObj.dutyEnabled === 'undefined') ? replacementValues.dutyEnabled : jsonObj.dutyEnabled;

            const sleepDuration = (typeof jsonObj.sleepDuration === 'undefined') ? replacementValues.sleepDuration : jsonObj.sleepDuration;
            const sleepDurationBetweenGains = (typeof jsonObj.sleepDurationBetweenGains === 'undefined') ? replacementValues.sleepDurationBetweenGains : jsonObj.sleepDurationBetweenGains;
            const sleepDurationBetweenGains3 = (typeof jsonObj.sleepDurationBetweenGains3 === 'undefined') ? replacementValues.sleepDurationBetweenGains3 : jsonObj.sleepDurationBetweenGains3;

            let recordDurationGain1 = (typeof jsonObj.recordDurationGain1 === 'undefined') ? jsonObj.recDurationGains1 : jsonObj.recordDurationGains1;
            recordDurationGain1 = (typeof recordDurationGain1 === 'undefined') ? replacementValues.recordDurationGain1 : recordDurationGain1;
            let recordDurationGain2 = (typeof jsonObj.recordDurationGain2 === 'undefined') ? jsonObj.recDurationGains2 : jsonObj.recordDurationGains2;
            recordDurationGain2 = (typeof recordDurationGain2 === 'undefined') ? replacementValues.recordDurationGain2 : recordDurationGain2;
            let recordDurationGain3 = (typeof jsonObj.recordDurationGain3 === 'undefined') ? jsonObj.recDurationGains3 : jsonObj.recordDurationGains3;
            recordDurationGain3 = (typeof recordDurationGain3 === 'undefined') ? replacementValues.recordDurationGain3 : recordDurationGain3;

            /* Try to find time zone mode. If loading an older file try to parse the localTime setting */

            let localTime;
            let customTimeZoneOffset;

            if (typeof jsonObj.customTimeZoneOffset === 'undefined') {

                localTime = (typeof jsonObj.localTime === 'undefined') ? replacementValues.localTime : jsonObj.localTime;

            } else {

                localTime = false;

                customTimeZoneOffset = jsonObj.customTimeZoneOffset;

            }

            /* In older versions of the app, whether or not the first/last date is enabled was specified in the save file by just the presence of the date */

            let firstRecordingDateEnabled;

            if (typeof jsonObj.firstRecordingDateEnabled === 'undefined') {

                if (typeof jsonObj.firstRecordingDate === 'undefined') {

                    firstRecordingDateEnabled = false;

                } else {

                    firstRecordingDateEnabled = true;

                }

            } else {

                firstRecordingDateEnabled = jsonObj.firstRecordingDateEnabled;

            }

            let lastRecordingDateEnabled;

            // In older versions of the app, whether or not the first/last date is enabled was specified in the save file by just the presence of the date

            if (typeof jsonObj.lastRecordingDateEnabled === 'undefined') {

                if (typeof jsonObj.lastRecordingDate === 'undefined') {

                    lastRecordingDateEnabled = false;

                } else {

                    lastRecordingDateEnabled = true;

                }

            } else {

                lastRecordingDateEnabled = jsonObj.lastRecordingDateEnabled;

            }

            let replacementFirstRecordingDate;

            if (typeof replacementValues.firstRecordingDate === 'undefined' || replacementValues.firstRecordingDate === '') {

                replacementFirstRecordingDate = '';

            } else {

                replacementFirstRecordingDate = replacementValues.firstRecordingDate;

            }

            const firstRecordingDate = (typeof jsonObj.firstRecordingDate === 'undefined') ? replacementFirstRecordingDate : jsonObj.firstRecordingDate;

            let replacementLastRecordingDate;

            if (typeof replacementValues.lastRecordingDate === 'undefined' || replacementValues.lastRecordingDate === '') {

                replacementLastRecordingDate = '';

            } else {

                replacementLastRecordingDate = replacementValues.lastRecordingDate;

            }

            const lastRecordingDate = (typeof jsonObj.lastRecordingDate === 'undefined') ? replacementLastRecordingDate : jsonObj.lastRecordingDate;

            const requireAcousticConfig = (typeof jsonObj.requireAcousticConfig === 'undefined') ? replacementValues.requireAcousticConfig : jsonObj.requireAcousticConfig;

            const dailyFolders = (typeof jsonObj.dailyFolders === 'undefined') ? replacementValues.dailyFolders : jsonObj.dailyFolders;

            const displayVoltageRange = (typeof jsonObj.displayVoltageRange === 'undefined') ? replacementValues.displayVoltageRange : jsonObj.displayVoltageRange;


            const energySaverModeEnabled = (typeof jsonObj.energySaverModeEnabled === 'undefined') ? replacementValues.energySaverModeEnabled : jsonObj.energySaverModeEnabled;

            const disable48DCFilter = (typeof jsonObj.disable48DCFilter === 'undefined') ? replacementValues.disable48DCFilter : jsonObj.disable48DCFilter;


            callback(timePeriods, ledEnabled, batteryLevelCheckEnabled, sampleRateIndex, gain1, gain2, gain3, dutyEnabled, sleepDuration, sleepDurationBetweensGains, sleepDurationBetweenGains3, recordDurationGain1, recordDurationGain2, recordDurationGain3, localTime, customTimeZoneOffset, firstRecordingDateEnabled, firstRecordingDate, lastRecordingDateEnabled, lastRecordingDate, passFiltersEnabled, requireAcousticConfig, displayVoltageRange, energySaverModeEnabled, disable48DCFilter,  dailyFolders);

            version = version === '0.0.0' ? '< 1.5.0' : version;

            console.log('Loaded configuration file created using version ' + version);

        } catch (usageErr) {

            dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
                type: 'error',
                title: 'Incorrect format',
                message: 'An error occurred whilst trying to read the Configuration file. The file format is incorrect.'
            });

            console.error(usageErr);

        }

    }

}

/* Display open dialog to allow users to load a .config file */

exports.loadConfiguration = (currentConfig, callback) => {

    const fileName = dialog.showOpenDialogSync({
        title: 'Open configuration',
        nameFieldLabel: 'Configuration name',
        defaultPath: 'AudioMoth.config',
        multiSelections: false,
        filters: [{
            name: 'config',
            extensions: ['config']
        }]
    });

    if (fileName) {

        fs.readFile(fileName[0], (err, data) => {

            useLoadedConfiguration(err, currentConfig, data, callback);

        });

    }

};
