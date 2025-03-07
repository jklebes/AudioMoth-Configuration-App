/****************************************************************************
 * uiSettings.js
 * openacousticdevices.info
 * November 2019
 *****************************************************************************/

const electron = require('electron');
const {dialog, BrowserWindow} = require('@electron/remote');

const constants = require('../constants.js');

const uiAdvanced = require('./uiAdvanced.js');
const splitDurationInput = require('./splitDurationInput.js');

/* UI components */

const sampleRadioButtons = document.getElementsByName('sample-rate-radio');
const gain1RadioButtons = document.getElementsByName('gain1-radio');
const gain2RadioButtons = document.getElementsByName('gain2-radio');
const gain3RadioButtons = document.getElementsByName('gain3-radio');

const dutyCheckBox = document.getElementById('duty-checkbox');

const sleepDurationInput = splitDurationInput.create('sleep-duration-input', 0, true);
const recordingDurationGain1Input = splitDurationInput.create('recording-duration-gain1-input', 1, true);
const sleepDurationBetweenInput = splitDurationInput.create('sleep-duration-between-input', 0, true);
const recordingDurationGain2Input = splitDurationInput.create('recording-duration-gain2-input', 0, true);
const sleepDurationBetween3Input = splitDurationInput.create('sleep-duration-between3-input', 0, true);
const recordingDurationGain3Input = splitDurationInput.create('recording-duration-gain3-input', 0, true);

// Define the next elements which tab navigation would jump to. This allows inputs to know whether or not to start from the final field if shift-tabbed to
const recordingDurationGain1TextInput = splitDurationInput.getTextInput(recordingDurationGain1Input);
const sleepDurationBetweenTextInput = splitDurationInput.getTextInput(sleepDurationBetweenInput);
const recordingDurationGain2TextInput = splitDurationInput.getTextInput(recordingDurationGain2Input);
const sleepDurationBetween3TextInput = splitDurationInput.getTextInput(sleepDurationBetween3Input);
const recordingDurationGain3TextInput = splitDurationInput.getTextInput(recordingDurationGain3Input);
splitDurationInput.setNextElements(sleepDurationInput, [recordingDurationGain1TextInput]);
splitDurationInput.setNextElements(recordingDurationGain1Input, [sleepDurationBetweenTextInput]);
splitDurationInput.setNextElements(sleepDurationBetweenInput, [recordingDurationGain2TextInput]);
splitDurationInput.setNextElements(recordingDurationGain2Input, [sleepDurationBetween3TextInput]);
splitDurationInput.setNextElements(sleepDurationBetween3Input, [recordingDurationGain3TextInput]);

const sleepDurationLabel = document.getElementById('sleep-duration-label');
const recordingDurationGain1Label = document.getElementById('recording-duration-gain1-label');
const sleepDurationBetweenLabel = document.getElementById('sleep-duration-between-label');
const recordingDurationGain2Label = document.getElementById('recording-duration-gain2-label');
const sleepDurationBetween3Label = document.getElementById('sleep-duration-between3-label');
const recordingDurationGain3Label = document.getElementById('recording-duration-gain3-label');

const batteryLevelCheckbox = document.getElementById('battery-level-checkbox');
const voltageRangeCheckBox = document.getElementById('voltage-range-checkbox');
const voltageRangeCheckBoxLabel = document.getElementById('voltage-range-checkbox-label');

/* Whether or not the warning on sleep duration being set less than 5 has been displayed this app load */

let sleepWarningDisplayed = false;

/* Whether or not to display a warning if minimum amplitude threshold is greater than recording length */

let displayDurationWarning = true;

/* Add listeners to all radio buttons which update the life display */

function addRadioButtonListeners (changeFunction) {

    for (let i = 0; i < sampleRadioButtons.length; i++) {

        sampleRadioButtons[i].addEventListener('change', () => {

            const sampleRateIndex = getSelectedRadioValue('sample-rate-radio');
            const sampleRate = constants.configurations[sampleRateIndex].trueSampleRate * 1000;

            changeFunction();

        });

    }

}

/* Prepare UI */

exports.prepareUI = (changeFunction) => {

    splitDurationInput.addChangeFunction(recordingDurationGain1Input, () => {

        changeFunction();

    });
    
    splitDurationInput.addChangeFunction(recordingDurationGain2Input, () => {

        changeFunction();

    });
    
    splitDurationInput.addChangeFunction(recordingDurationGain3Input, () => {

        changeFunction();

    });

    splitDurationInput.addChangeFunction(sleepDurationInput, () => {

        changeFunction();

        if (!sleepWarningDisplayed && splitDurationInput.getValue(sleepDurationInput) < 5) {

            sleepWarningDisplayed = true;

            const buttonIndex = dialog.showMessageBoxSync({
                type: 'warning',
                buttons: ['Yes', 'No'],
                title: 'Minimum sleep duration',
                message: 'In some circumstances, your AudioMoth may not be able to open and a close each file in less than 5 seconds. Are you sure you wish to continue?'
            });

            if (buttonIndex !== 0) {

                splitDurationInput.setTotalValue(sleepDurationInput, 5);

            }

        }

    });

    splitDurationInput.addChangeFunction(sleepDurationBetweenInput, () => {

        changeFunction();

    });

    splitDurationInput.addChangeFunction(sleepDurationBetween3Input, () => {

        changeFunction();

    });

    dutyCheckBox.addEventListener('change', () => {

        updateDutyCycleUI();
        changeFunction();

    });


    splitDurationInput.setTotalValue(sleepDurationInput, 5);
    splitDurationInput.setTotalValue(recordingDurationGain1Input, 55);
    splitDurationInput.setTotalValue(recordingDurationGain2Input, 0);
    splitDurationInput.setTotalValue(recordingDurationGain3Input, 0);
    splitDurationInput.setTotalValue(sleepDurationBetweenInput, 0);
    splitDurationInput.setTotalValue(sleepDurationBetween3Input, 0);

};

function getSelectedRadioValue (radioName) {

    return document.querySelector('input[name="' + radioName + '"]:checked').value;

}

exports.getSettings = () => {

    const settings = {
        sampleRateIndex: parseInt(getSelectedRadioValue('sample-rate-radio')),
        gain1: parseInt(getSelectedRadioValue('gain1-radio')),
        gain2: parseInt(getSelectedRadioValue('gain2-radio')),
        gain3: parseInt(getSelectedRadioValue('gain3-radio')),
        dutyEnabled: dutyCheckBox.checked,
        recordDurationGain1: splitDurationInput.getValue(recordingDurationGain1Input),
        recordDurationGain2: splitDurationInput.getValue(recordingDurationGain2Input),
        recordDurationGain3: splitDurationInput.getValue(recordingDurationGain3Input),
        sleepDuration: splitDurationInput.getValue(sleepDurationInput),
        sleepDurationBetweenGains: splitDurationInput.getValue(sleepDurationBetweenInput),
        sleepDurationBetweenGains3: splitDurationInput.getValue(sleepDurationBetween3Input),
        requireAcousticConfig: uiAdvanced.isAcousticConfigRequired(),
        dailyFolders: uiAdvanced.isDailyFolderEnabled(),
        displayVoltageRange: voltageRangeCheckBox.checked,
        energySaverModeEnabled: uiAdvanced.isEnergySaverModeEnabled(),
        disable48DCFilter: uiAdvanced.is48DCFilterDisabled(),
    };

    return settings;

};


exports.fillUI = (settings) => {

    voltageRangeCheckBox.checked = settings.displayVoltageRange;

    sampleRadioButtons[settings.sampleRateIndex].checked = true;
    gain1RadioButtons[settings.gain1].checked = true;
    gain2RadioButtons[settings.gain2].checked = true;
    gain3RadioButtons[settings.gain3].checked = true;

    dutyCheckBox.checked = settings.dutyEnabled;
    updateDutyCycleUI();

    const sampleRateIndex = getSelectedRadioValue('sample-rate-radio');
    const sampleRate = constants.configurations[sampleRateIndex].trueSampleRate * 1000;

    splitDurationInput.setTotalValue(sleepDurationInput, settings.sleepDuration);
    splitDurationInput.setTotalValue(sleepDurationBetweenInput, settings.sleepDurationBetweenGains);
    splitDurationInput.setTotalValue(sleepDurationBetween3Input, settings.sleepDurationBetweenGains3);
    splitDurationInput.setTotalValue(recordingDurationGain1Input, settings.recordDurationGain1);
    splitDurationInput.setTotalValue(recordingDurationGain2Input, settings.recordDurationGain2);
    splitDurationInput.setTotalValue(recordingDurationGain3Input, settings.recordDurationGain3);

    uiAdvanced.fillUI(settings);

};


function updateVoltageRangeStatus () {

    if (batteryLevelCheckbox.checked) {

        voltageRangeCheckBox.disabled = false;
        voltageRangeCheckBoxLabel.classList.remove('grey');

    } else {

        voltageRangeCheckBox.disabled = true;
        voltageRangeCheckBoxLabel.classList.add('grey');

    }

}

exports.updateVoltageRangeStatus = updateVoltageRangeStatus;

batteryLevelCheckbox.addEventListener('change', updateVoltageRangeStatus);
