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
    uint16_t sleepDurationBetweenGains;
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

    const gain1 = packet[4];
    const gain2 = packet[5];
    const clockDivider = packet[6];
    const acquisitionCycles = packet[7];
    const oversampleRate = packet[8];

    const sampleRate = fourBytesToNumber(packet, 9);
    const sampleRateDivider = packet[13];

    const sleepDuration = twoBytesToNumber(packet, 14);
    const sleepDurationBetweenGains = twoBytesToNumber(packet, 16);
    const recordDurationGain1 = twoBytesToNumber(packet, 18);
    const recordDurationGain2 = twoBytesToNumber(packet, 20);

    const packedByte0 = packet[22];
    const enableLED = packedByte0 & 1;
    //const enableLowVoltageCutoff = (packedByte0 >> 1) & 1;
    const disableBatteryLevelDisplay = (packedByte0 >> 2) & 1;
    const disableSleepRecordCycle = (packedByte0 >> 3) & 1;
    const energySaverModeEnabled = (packedByte0 >> 4) & 1;
    const disable48DCFilter = (packedByte0 >> 5) & 1;
    const lowGainRangeEnabled = (packedByte0 >> 6) & 1;
    const dailyFolders = (packedByte0 >> 7 ) & 1;

    const activeStartStopPeriods = packet[23];
    const startStopPeriods = [];

    for (let i = 0; i < activeStartStopPeriods; i += 1) {

        const startMinutes = twoBytesToNumber(packet, 24 + 4 * i);
        const endMinutes = twoBytesToNumber(packet, 26 + 4 * i);

        startStopPeriods.push({startMinutes, endMinutes});

    }

    const timeZoneHours = packet[44] > 127 ? packet[44] - 256 : packet[44];

    const timeZoneMinutes = packet[45] > 127 ? packet[45] - 256 : packet[45];

    const earliestRecordingTime = audiomoth.convertFourBytesFromBufferToDate(packet, 46);
    const latestRecordingTime = audiomoth.convertFourBytesFromBufferToDate(packet, 50);
    
    const packedByte1 = packet[54];
    const requireAcousticConfig = packedByte1 & 1;
    const displayVoltageRange = (packedByte1 >> 1) & 1;

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
    console.log('Sleep duration between gains:', sleepDurationBetweenGains);
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
