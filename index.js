"use strict";

const record = require("node-record-lpcm16");
const {Detector, Models} = require("snowboy");
var FormData = require('form-data');
const models = new Models();

const config = require("./config");

var http = require("http");
var fs = require("fs");


models.add({
  file: 'resources/Alexa.pmdl',
  sensitivity: '0.5',
  hotwords : 'alexa'
});
const d = new Detector({
    resource: "resources/common.res",
    models: models,
    audioGain: 2.0
});

d.on('silence', function() {
    console.log("silence");
    if (noiseCount > 1) {
        console.log("Done recording");
        stopRecording();
    }
    noiseCount = 0;
});

d.on('sound', function() {
    console.log('noise');
    noiseCount += 1;
});

d.on('error', function() {
    console.log('error');
});

d.on('hotword', function(index, a, b, c) {
    console.log('hotword', index);
    noiseCount = 0;

    if (!isRecording) {
        isRecording = true;
        file = fs.createWriteStream('recording.wav', {
            encoding: 'binary'
        });
        r.pipe(file);
        console.log("Start recording");
        setTimeout(function() {
            stopRecording();
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


      const xhr = new XMLHttpRequest();
      const url = 'https://access-alexa-na.amazon.com/v1/avs/speechrecognizer/recognize';

      xhr.open('POST', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = (event) => {
        const buffer = new Buffer(xhr.response);

        if (xhr.status === 200) {
          const parsedMessage = httpMessageParser(buffer);
          resolve({xhr, response: parsedMessage});
        } else {
          let error = new Error('An error occured with request.');
          let response = {};

          if (!xhr.response.byteLength) {
            error = new Error('Empty response.');
          } else {
            try {
              response = JSON.parse(arrayBufferToString(buffer));
            } catch(err) {
              error = err;
            }
          }

          if (response.error instanceof Object) {
            // if (response.error.code === AMAZON_ERROR_CODES.InvalidAccessTokenException) {
            //   this.emit(AVS.EventTypes.TOKEN_INVALID);
            // }
            console.log(response.error);
            error = response.error.message;
          }
        }
      };

      xhr.onerror = (error) => {
        console.log(error);
      };

      const BOUNDARY = 'BOUNDARY1234';
      const BOUNDARY_DASHES = '--';
      const NEWLINE = '\r\n';
      const METADATA_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="metadata"';
      const METADATA_CONTENT_TYPE = 'Content-Type: application/json; charset=UTF-8';
      const AUDIO_CONTENT_TYPE = 'Content-Type: audio/L16; rate=16000; channels=1';
      const AUDIO_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="audio"';

      const metadata = {
        messageHeader: {},
        messageBody: {
          profile: 'alexa-close-talk',
          locale: 'en-us',
          format: 'audio/L16; rate=16000; channels=1'
        }
      };

      const postDataStart = [
        NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE, METADATA_CONTENT_DISPOSITION, NEWLINE, METADATA_CONTENT_TYPE,
        NEWLINE, NEWLINE, JSON.stringify(metadata), NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE,
        AUDIO_CONTENT_DISPOSITION, NEWLINE, AUDIO_CONTENT_TYPE, NEWLINE, NEWLINE
      ].join('');

      const postDataEnd = [NEWLINE, BOUNDARY_DASHES, BOUNDARY, BOUNDARY_DASHES, NEWLINE].join('');

      const size = postDataStart.length + dataView.byteLength + postDataEnd.length;
      const uint8Array = new Uint8Array(size);
      let i = 0;

      for (; i < postDataStart.length; i++) {
        uint8Array[i] = postDataStart.charCodeAt(i) & 0xFF;
      }

      for (let j = 0; j < dataView.byteLength ; i++, j++) {
        uint8Array[i] = dataView.getUint8(j);
      }

      for (let j = 0; j < postDataEnd.length; i++, j++) {
        uint8Array[i] = postDataEnd.charCodeAt(j) & 0xFF;
      }

      const payload = uint8Array.buffer;

      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + BOUNDARY);
      xhr.send(payload);

        /*
        const url = 'https://access-alexa-na.amazon.com/v1/avs/speechrecognizer/recognize';
        var formData = new FormData();

        // http.request(url, function(response) {
        //   formData.append('files', fs.createReadStream('recording.wav'));
        // });

        formData.append('files', fs.createReadStream('recording.wav'), {
          "Content-Disposition": "form-data; name=\"audio\"",
          "Content-Type": "audio/L16; rate=16000; channels=1"
        });
        formData.submit({
          //url: url,
          host: "access-alexa-na.amazon.com",
          path: "/v1/avs/speechrecognizer/recognize",
          headers: {
            'Authorization': 'Bearer xxxxxxxxxxxx',
            'Content-Type:': 'multipart/form-data; boundary=BOUNDARY1234'
          }
        }, function(err, res) {
          console.log(err);
          console.log(res.statusCode);
          console.log(res);
        });
        */

    }
}

const r = record.start({
    threshold: 0,
    //verbose: true
});

r.pipe(d);
