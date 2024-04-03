/****************************************************************************
 * packetReader.js
 * openacousticdevices.info
 * April 2020
 *****************************************************************************/

'use strict';

const audiomoth = require('audiomoth-hid');

const constants = require('./constants.js');

function fourBytesToNumber (buffer, offset) {

    return (buffer[offset] & 0xFF) + ((buffer[offset + 1] & 0xFF) << 8) + ((buffer[offset + 2] & 0xFF) << 16) + ((buffer[offset + 3] & 0xFF) << 24);

}

function twoBytesToNumber (buffer, offset) {

    return (buffer[offset] & 0xFF) + ((buffer[offset + 1] & 0xFF) << 8);

}

function digitWithLeadingZero (value) {

    const formattedString = '0' + value;

    return formattedString.substring(formattedString.length - 2);

}

function formatTime (minutes) {

    return digitWithLeadingZero(Math.floor(minutes / constants.MINUTES_IN_HOUR)) + ':' + digitWithLeadingZero(minutes % constants.MINUTES_IN_HOUR);

}

function formatDate (date) {

    return (date.valueOf() / 1000) + ' - ' + date.toISOString().replace(/T/, ' ').replace(/\..+/, '') + ' (UTC)';

}

function formatPercentage (mantissa, exponent) {

    let response = '';

    if (exponent < 0) {

        response += '0.0000'.substring(0, 1 - exponent);

    }

    response += mantissa;

    for (let i = 0; i < exponent; i += 1) response += '0';

    return response;

}

/*

#define MAX_START_STOP_PERIODS              5

typedef struct {
    uint16_t startMinutes;
    uint16_t stopMinutes;
} startStopPeriod_t;

typedef struct {
    uint32_t time;
    AM_gainSetting_t gain1;
    AM_gainSetting_t gain2;
    uint8_t clockDivider;
    uint8_t acquisitionCycles;
    uint8_t oversampleRate;
    uint32_t sampleRate;
    uint8_t sampleRateDivider;
    uint16_t sleepDuration;
    uint16_t recordDurationGain1;
    uint16_t recordDurationGain2;
    uint8_t enableLED;
    uint8_t activeStartStopPeriods;
    startStopPeriod_t startStopPeriods[MAX_START_STOP_PERIODS];
    int8_t timeZoneHours;
    uint8_t enableLowVoltageCutoff;
    uint8_t disableBatteryLevelDisplay;
    int8_t timeZoneMinutes;
    uint8_t disableSleepRecordCycle;
    uint32_t earliestRecordingTime;
    uint32_t latestRecordingTime;
    uint8_t requireAcousticConfiguration : 1;
    AM_batteryLevelDisplayType_t batteryLevelDisplayType : 1;
    uint8_t enableEnergySaverMode : 1;
    uint8_t disable48HzDCBlockingFilter : 1;
    uint8_t enableLowGainRange : 1;
    uint8_t enableDailyFolders : 1;
} configSettings_t;

*/

exports.read = (packet) => {

    /* Read and decode configuration packet */

    const time = audiomoth.convertFourBytesFromBufferToDate(packet, 0);

    const gain = packet[4];
    const clockDivider = packet[5];
    const acquisitionCycles = packet[6];
    const oversampleRate = packet[7];

    const sampleRate = fourBytesToNumber(packet, 8);
    const sampleRateDivider = packet[12];

    const sleepDuration = twoBytesToNumber(packet, 13);
    const recordDuration = twoBytesToNumber(packet, 15);

    const enableLED = packet[17];

    const activeStartStopPeriods = packet[18];
    const startStopPeriods = [];

    for (let i = 0; i < activeStartStopPeriods; i += 1) {

        const startMinutes = twoBytesToNumber(packet, 19 + 4 * i);
        const endMinutes = twoBytesToNumber(packet, 21 + 4 * i);

        startStopPeriods.push({startMinutes, endMinutes});

    }

    const timeZoneHours = packet[39] > 127 ? packet[39] - 256 : packet[39];

    /* Low voltage cutoff is now always enabled */

    // const enableLowVoltageCutoff = packet[40];

    const disableBatteryLevelDisplay = packet[41];

    const timeZoneMinutes = packet[42] > 127 ? packet[42] - 256 : packet[42];

    const disableSleepRecordCycle = packet[43];

    const earliestRecordingTime = audiomoth.convertFourBytesFromBufferToDate(packet, 44);
    const latestRecordingTime = audiomoth.convertFourBytesFromBufferToDate(packet, 48);

    const packedByte0 = packet[58];

    const requireAcousticConfig = packedByte0 & 1;

    const displayVoltageRange = (packedByte0 >> 1) & 1;

    /* Read remaining settings */

    const packedByte3 = packet[61];

    const energySaverModeEnabled = packedByte3 & 1;

    const disable48DCFilter = (packedByte3 >> 1) & 1;

    const lowGainRangeEnabled = (packedByte3 >> 4) & 1;

    const dailyFolders = (packedByte3 >> 6) & 1;


    /* Display configuration */

    console.log('Current time: ', formatDate(time));

    console.log('TimeZone Hours:', timeZoneHours);
    console.log('TimeZone Minutes:', timeZoneMinutes);

    console.log('Gain1:', gain1);
    console.log('Gain2:', gain2);
    console.log('Clock divider:', clockDivider);
    console.log('Acquisition cycles:', acquisitionCycles);
    console.log('Oversample rate:', oversampleRate);
    console.log('Sample rate:', sampleRate);
    console.log('Sample rate divider:', sampleRateDivider);

    console.log('Enable sleep/record cyclic recording:', disableSleepRecordCycle === 0);
    console.log('Sleep duration:', sleepDuration);
    console.log('Recording duration Gain1:', recordDurationGain1);
    console.log('Recording duration Gain2:', recordDurationGain2);

    console.log('Enable LED:', enableLED === 1);
    console.log('Enable battery level indication:', disableBatteryLevelDisplay === 0);

    console.log('Active recording periods:', activeStartStopPeriods);

    for (let j = 0; j < activeStartStopPeriods; j++) {

        const startMins = startStopPeriods[j].startMinutes;
        const endMins = startStopPeriods[j].endMinutes;

        console.log('Start: ' + formatTime(startMins) + ' (' + startMins + ') - End: ' + formatTime(endMins) + ' (' + endMins + ')');

    }

    console.log('Earliest recording time:', formatDate(earliestRecordingTime));
    console.log('Latest recording time:', formatDate(latestRecordingTime));

    console.log('Acoustic configuration required:', requireAcousticConfig === 1);

    console.log('Use NiMH/LiPo voltage range for battery level indication:', displayVoltageRange === 1);

    console.log('Energy saver mode enabled:', energySaverModeEnabled === 1);

    console.log('48 Hz DC blocking filter disabled:', disable48DCFilter === 1);

    console.log('Low gain range enabled: ', lowGainRangeEnabled === 1);

    console.log('Daily folders enabled:', dailyFolders === 1);

};
