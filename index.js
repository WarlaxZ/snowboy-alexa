"use strict";

const SnowboyDetect = require('snowboy');
const record = require('node-record-lpcm16');

var http = require('http');
var fs = require('fs');

const d = new SnowboyDetect({
    resource: "resources/common.res",
      model: "resources/Alexa.pmdl",
      sensitivity: "0.5",
      audioGain: 2.0
});

d.on('silence', function () {
    console.log('silence');
    if (noiseCount > 1) {
        console.log("Done recording");
        stopRecording();
    }
    noiseCount = 0;
});

d.on('noise', function () {
    console.log('noise');
    noiseCount += 1;
});

d.on('error', function () {
    console.log('error');
});

d.on('hotword', function (index, a, b, c) {
    console.log('hotword', index);
    noiseCount = 0;

    if (!isRecording) {
        isRecording = true;
        file = fs.createWriteStream('recording.wav', { encoding: 'binary' });
        r.pipe(file);
        console.log("Start recording");
        setTimeout(function() {
            stopRecording()
        }, 10000); //Max recording for 10 seconds before stopping
    }
});

var isRecording = false;
var noiseCount = 0;
var file;

function stopRecording() {
    if (isRecording) {
        r.unpipe(file);
        file.close();
        console.log("Sending recording to amazon goes here!");
        isRecording = false;
    }
}

const r = record.start({
    threshold: 0,
      //verbose: true
});

r.pipe(d);
