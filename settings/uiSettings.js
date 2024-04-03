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
const gainRadioButtons = document.getElementsByName('gain-radio');

const dutyCheckBox = document.getElementById('duty-checkbox');

const sleepDurationInput = splitDurationInput.create('sleep-duration-input', 0, true);
const recordingDurationInput = splitDurationInput.create('recording-duration-input', 1, true);

// Define the next elements which tab navigation would jump to. This allows inputs to know whether or not to start from the final field if shift-tabbed to
const recordingDurationTextInput = splitDurationInput.getTextInput(recordingDurationInput);
splitDurationInput.setNextElements(sleepDurationInput, [recordingDurationTextInput]);
const ledCheckbox = document.getElementById('led-checkbox');
splitDurationInput.setNextElements(recordingDurationInput, [ledCheckbox]);

const recordingDurationLabel = document.getElementById('recording-duration-label');
const sleepDurationLabel = document.getElementById('sleep-duration-label');

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

            uiFiltering.sampleRateChange(!passFiltersObserved, !centreObserved, sampleRate);
            changeFunction();

        });

    }

}

/* Prepare UI */

exports.prepareUI = (changeFunction) => {

    splitDurationInput.addChangeFunction(recordingDurationInput, () => {

        changeFunction();
        checkRecordingDuration();

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

    dutyCheckBox.addEventListener('change', () => {

        updateDutyCycleUI();
        changeFunction();

    });

    addRadioButtonListeners(changeFunction);

    updateDutyCycleUI();

    uiFiltering.prepareUI(changeFunction, checkRecordingDuration, () => {

        const sampleRateIndex = getSelectedRadioValue('sample-rate-radio');
        const sampleRate = constants.configurations[sampleRateIndex].trueSampleRate * 1000;

        // If a Goertzel value has been changed, don't rescale the values to defaults as sample rate changes
        const passFiltersObserved = uiFiltering.getPassFiltersObserved();
        const centreObserved = uiFiltering.getCentreObserved();
        uiFiltering.sampleRateChange(!passFiltersObserved, !centreObserved, sampleRate);

    });

    uiAdvanced.prepareUI(changeFunction);

    splitDurationInput.setTotalValue(sleepDurationInput, 5);
    splitDurationInput.setTotalValue(recordingDurationInput, 55);

};

function getSelectedRadioValue (radioName) {

    return document.querySelector('input[name="' + radioName + '"]:checked').value;

}

exports.getSettings = () => {

    const settings = {
        sampleRateIndex: parseInt(getSelectedRadioValue('sample-rate-radio')),
        gain1: parseInt(getSelectedRadioValue('gain1-radio')),
        gain2: parseInt(getSelectedRadioValue('gain2-radio')),
        dutyEnabled: dutyCheckBox.checked,
        recordDurationGain1: splitDurationInput.getValue(recordingDurationGain1Input),
        recordDurationGain2: splitDurationInput.getValue(recordingDurationGain2Input),
        sleepDuration: splitDurationInput.getValue(sleepDurationInput),
        requireAcousticConfig: uiAdvanced.isAcousticConfigRequired(),
        dailyFolders: uiAdvanced.isDailyFolderEnabled(),
        displayVoltageRange: voltageRangeCheckBox.checked,
        energySaverModeEnabled: uiAdvanced.isEnergySaverModeEnabled(),
        lowGainRangeEnabled: uiAdvanced.isLowGainRangeEnabled(),
        disable48DCFilter: uiAdvanced.is48DCFilterDisabled(),
    };

    return settings;

};


exports.fillUI = (settings) => {

    voltageRangeCheckBox.checked = settings.displayVoltageRange;

    sampleRadioButtons[settings.sampleRateIndex].checked = true;
    gain1RadioButtons[settings.gain1].checked = true;
    gain2RadioButtons[settings.gain2].checked = true;

    dutyCheckBox.checked = settings.dutyEnabled;
    updateDutyCycleUI();

    const sampleRateIndex = getSelectedRadioValue('sample-rate-radio');
    const sampleRate = constants.configurations[sampleRateIndex].trueSampleRate * 1000;

    splitDurationInput.setTotalValue(sleepDurationInput, settings.sleepDuration);
    splitDurationInput.setTotalValue(recordingDurationGain1Input, settings.recordDurationGain1);
    splitDurationInput.setTotalValue(recordingDurationGain2Input, settings.recordDurationGain2);

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
