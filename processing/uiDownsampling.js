/****************************************************************************
 * uiDownsampling.js
 * openacousticdevices.info
 * June 2022
 *****************************************************************************/

'use strict';

/* global document */

const electron = require('electron');
const dialog = electron.remote.dialog;

/* Get functions which control elements common to the expansion, split, and downsample windows */
const ui = require('./uiCommon.js');
const uiOutput = require('./uiOutput.js');

const path = require('path');
const fs = require('fs');

const audiomothUtils = require('audiomoth-utils');

var currentWindow = electron.remote.getCurrentWindow();

const SAMPLE_RATES = [8000, 16000, 32000, 48000, 96000, 192000, 250000, 384000];

const FILE_REGEX = /^(\d\d\d\d\d\d\d\d_)?\d\d\d\d\d\d.WAV$/;

const sampleRateRadioHolder = document.getElementById('sample-rate-holder');
const disabledSampleRateRadioHolder = document.getElementById('disabled-sample-rate-holder');

const sampleRateRadios = document.getElementsByName('sample-rate-radio');
const disabledSampleRateRadios = document.getElementsByName('disabled-sample-rate-radio');

const selectionRadios = document.getElementsByName('selection-radio');

const prefixCheckbox = document.getElementById('prefix-checkbox');
const prefixInput = document.getElementById('prefix-input');

const fileLabel = document.getElementById('file-label');
const fileButton = document.getElementById('file-button');
const downsampleButton = document.getElementById('downsample-button');

var files = [];
var downsampling = false;

/* Disable UI elements in main window while progress bar is open and downsample is in progress */

function disableUI () {

    fileButton.disabled = true;
    downsampleButton.disabled = true;
    selectionRadios[0].disabled = true;
    selectionRadios[1].disabled = true;

    sampleRateRadioHolder.style.display = 'none';
    disabledSampleRateRadioHolder.style.display = '';

    uiOutput.disableOutputCheckbox();
    uiOutput.disableOutputButton();

    prefixCheckbox.disabled = true;
    prefixInput.disabled = true;

}

function enableUI () {

    fileButton.disabled = false;
    downsampleButton.disabled = false;
    selectionRadios[0].disabled = false;
    selectionRadios[1].disabled = false;

    sampleRateRadioHolder.style.display = '';
    disabledSampleRateRadioHolder.style.display = 'none';

    uiOutput.enableOutputCheckbox();
    uiOutput.enableOutputButton();

    prefixCheckbox.disabled = false;

    if (prefixCheckbox.checked) {

        prefixInput.disabled = false;

    }

    downsampling = false;

}

/* Split selected files */

function downsampleFiles () {

    if (!files) {

        return;

    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const errorFiles = [];

    let errorFilePath;

    for (let i = 0; i < files.length; i++) {

        /* If progress bar is closed, the downsample task is considered cancelled. This will contact the main thread and ask if that has happened */

        const cancelled = electron.ipcRenderer.sendSync('poll-downsample-cancelled');

        if (cancelled) {

            console.log('Downsample cancelled.');
            enableUI();
            return;

        }

        /* Let the main thread know what value to set the progress bar to */

        electron.ipcRenderer.send('set-downsample-bar-progress', i, 0, path.basename(files[i]));

        const sampleRate = SAMPLE_RATES[ui.getSelectedRadioValue('sample-rate-radio')];

        console.log('Downsampling:', files[i]);
        console.log('New sample rate:', sampleRate);

        console.log('-');

        /* Check if the optional prefix/output directory setttings are being used. If left as null, splitter will put file(s) in the same directory as the input with no prefix */

        const outputPath = uiOutput.isChecked() ? uiOutput.getOutputDir() : null;
        const prefix = (prefixCheckbox.checked && prefixInput.value !== '') ? prefixInput.value : null;

        const response = audiomothUtils.downsample(files[i], outputPath, prefix, sampleRate, (progress) => {

            electron.ipcRenderer.send('set-downsample-bar-progress', i, progress, path.basename(files[i]));

        });

        if (response.success) {

            successCount++;

        } else {

            /* Add error to log file */

            errorCount++;
            errors.push(response.error);
            errorFiles.push(files[i]);

            electron.ipcRenderer.send('set-downsample-bar-error', path.basename(files[i]));

            if (errorCount === 1) {

                const errorFileLocation = uiOutput.isChecked() ? uiOutput.getOutputDir() : path.dirname(errorFiles[0]);

                errorFilePath = path.join(errorFileLocation, 'ERRORS.TXT');

            }

            let fileContent = '';

            for (let j = 0; j < errorCount; j++) {

                fileContent += path.basename(errorFiles[j]) + ' - ' + errors[j] + '\n';

            }

            try {

                fs.writeFileSync(errorFilePath, fileContent);

                console.log('Error summary written to ' + errorFilePath);

            } catch (err) {

                console.error(err);
                electron.ipcRenderer.send('set-downsample-bar-completed', successCount, errorCount, true);
                return;

            }

            ui.sleep(3000);

        }

    }

    /* Notify main thread that split is complete so progress bar is closed */

    electron.ipcRenderer.send('set-downsample-bar-completed', successCount, errorCount, false);

}

/* When the progress bar is complete and the summary window at the end has been displayed for a fixed amount of ttime, it will close and this re-enables the UI */

electron.ipcRenderer.on('downsample-summary-closed', enableUI);

/* Update label to reflect new file/folder selection */

function updateInputDirectoryDisplay (directoryArray) {

    if (directoryArray.length === 0 || !directoryArray) {

        fileLabel.innerHTML = 'No AudioMoth WAV files selected.';
        downsampleButton.disabled = true;

    } else {

        fileLabel.innerHTML = 'Found ';
        fileLabel.innerHTML += directoryArray.length + ' AudioMoth WAV file';
        fileLabel.innerHTML += (directoryArray.length === 1 ? '' : 's');
        fileLabel.innerHTML += '.';
        downsampleButton.disabled = false;

    }

}

/* Reset UI back to default state, clearing the selected files */

function resetUI () {

    files = [];

    fileLabel.innerHTML = 'No AudioMoth WAV files selected.';

    downsampleButton.disabled = true;

    sampleRateRadioHolder.style.display = 'none';
    disabledSampleRateRadioHolder.style.display = '';

    ui.updateButtonText();

}

/* Whenever the file/folder radio button changes, reset the UI */

selectionRadios[0].addEventListener('change', resetUI);
selectionRadios[1].addEventListener('change', resetUI);

/* Select/process file(s) buttons */

fileButton.addEventListener('click', () => {

    files = ui.selectRecordings(FILE_REGEX);

    updateInputDirectoryDisplay(files);

    ui.updateButtonText();

});

downsampleButton.addEventListener('click', () => {

    if (downsampling) {

        return;

    }

    if ((!prefixCheckbox.checked || prefixInput.value === '') && (!uiOutput.isChecked() || uiOutput.getOutputDir() === '')) {

        dialog.showMessageBox(currentWindow, {
            type: 'error',
            title: 'Cannot downsample with current settings',
            message: 'Without a prefix or custom destination, downsampling will overwrite the original file. Set one of these values to continue.'
        });

        return;

    }

    downsampling = true;
    disableUI();

    electron.ipcRenderer.send('start-downsample-bar', files.length);
    setTimeout(downsampleFiles, 2000);

});

for (let i = 0; i < sampleRateRadios.length; i++) {

    sampleRateRadios[i].addEventListener('click', () => {

        // Match hidden sample rate radios which are only displayed when UI is disabled

        disabledSampleRateRadios[i].checked = true;

    });

}
