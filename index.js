"use strict";

const SnowboyDetect = require('snowboy');
const record = require('node-record-lpcm16');
const AVS = require('alexa-voice-service');
const config = require('config');

const avs = new AVS({
    debug: true,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    deviceId: config.deviceId,
    deviceSerialNumber: config.deviceSerialNumber
});

var http = require('http');
var fs = require('fs');


var token = "set_me";
var refreshToken = "set_me";
fs.readFile( __dirname + '/token_cache.txt', function (err, data) {
    if (err) {
        throw err; 
    }
    refreshToken = data.toString();
    avs.getTokenFromRefreshToken(refreshToken).then(function(responseToken) {
        token = responseToken;
    });
});

avs.requestMic();


const d = new SnowboyDetect({
    resource: "resources/common.res",
    model: "resources/Alexa.pmdl",
    sensitivity: "0.5",
    audioGain: 2.0
});

d.on('silence', function() {
    console.log('silence');
    if (noiseCount > 1) {
        console.log("Done recording");
        stopRecording();
    }
    noiseCount = 0;
});

d.on('noise', function() {
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
        avs.startRecording();
        file = fs.createWriteStream('recording.wav', {
            encoding: 'binary'
        });
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

        avs.stopRecording().then(dataView => {
            avs.player.emptyQueue()
                .then(() => avs.audioToBlob(dataView))
                .then(blob => logAudioBlob(blob, 'VOICE'))
                .then(() => avs.player.enqueue(dataView))
                .then(() => avs.player.play())
                .catch(error => {
                    console.error(error);
                });

            var ab = false;
            //sendBlob(blob);
            avs.sendAudio(dataView)
                .then(({
                    xhr,
                    response
                }) => {

                    var promises = [];
                    var audioMap = {};
                    var directives = null;

                    if (response.multipart.length) {
                        response.multipart.forEach(multipart => {
                            let body = multipart.body;
                            if (multipart.headers && multipart.headers['Content-Type'] === 'application/json') {
                                try {
                                    body = JSON.parse(body);
                                } catch (error) {
                                    console.error(error);
                                }

                                if (body && body.messageBody && body.messageBody.directives) {
                                    directives = body.messageBody.directives;
                                }
                            } else if (multipart.headers['Content-Type'] === 'audio/mpeg') {
                                const start = multipart.meta.body.byteOffset.start;
                                const end = multipart.meta.body.byteOffset.end;

                                /**
                                 * Not sure if bug in buffer module or in http message parser
                                 * because it's joining arraybuffers so I have to this to
                                 * seperate them out.
                                 */
                                var slicedBody = xhr.response.slice(start, end);

                                //promises.push(avs.player.enqueue(slicedBody));
                                audioMap[multipart.headers['Content-ID']] = slicedBody;
                            }
                        });

                        function findAudioFromContentId(contentId) {
                            contentId = contentId.replace('cid:', '');
                            for (var key in audioMap) {
                                if (key.indexOf(contentId) > -1) {
                                    return audioMap[key];
                                }
                            }
                        }

                        directives.forEach(directive => {
                            if (directive.namespace === 'SpeechSynthesizer') {
                                if (directive.name === 'speak') {
                                    const contentId = directive.payload.audioContent;
                                    const audio = findAudioFromContentId(contentId);
                                    if (audio) {
                                        avs.audioToBlob(audio)
                                            .then(blob => logAudioBlob(blob, 'RESPONSE'));
                                        promises.push(avs.player.enqueue(audio));
                                    }
                                }
                            } else if (directive.namespace === 'AudioPlayer') {
                                if (directive.name === 'play') {
                                    const streams = directive.payload.audioItem.streams;
                                    streams.forEach(stream => {
                                        const streamUrl = stream.streamUrl;

                                        const audio = findAudioFromContentId(streamUrl);
                                        if (audio) {
                                            avs.audioToBlob(audio)
                                                .then(blob => logAudioBlob(blob, 'RESPONSE'));
                                            promises.push(avs.player.enqueue(audio));
                                        } else if (streamUrl.indexOf('http') > -1) {
                                            const xhr = new XMLHttpRequest();
                                            const url = `/parse-m3u?url=${streamUrl.replace(/!.*$/, '')}`;
                                            xhr.open('GET', url, true);
                                            xhr.responseType = 'json';
                                            xhr.onload = (event) => {
                                                const urls = event.currentTarget.response;

                                                urls.forEach(url => {
                                                    avs.player.enqueue(url);
                                                });
                                            };
                                            xhr.send();
                                        }
                                    });
                                } else if (directive.namespace === 'SpeechRecognizer') {
                                    if (directive.name === 'listen') {
                                        const timeout = directive.payload.timeoutIntervalInMillis;
                                        // enable mic
                                    }
                                }
                            }
                        });

                        if (promises.length) {
                            Promise.all(promises)
                                .then(() => {
                                    avs.player.playQueue()
                                });
                        }
                    }

                })
                .catch(error => {
                    console.error(error);
                });
        });
    });
}

const r = record.start({
    threshold: 0,
    //verbose: true
});

r.pipe(d);
