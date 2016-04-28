// Copyright (c) 2015, Masahiko Imanaka. All rights reserved.
/* global localStorage, MozSpeakerManager, SpeechSynthesisUtterance, speechSynthesis, AirplaneModeHelper */
/* jshint moz:true, esnext:true */

(function() {
'use strict';

var fmRadio, gMinFreq, gMaxFreq,
    isSeeking = false,
    speakerManager, isOutput2Speaker,
    speachEnabled = false,
    //airplaneModeEnabled = false,
    ctrlContainer = document.getElementById('container'),
    radioStatus = document.getElementById('radioStatus'),
    radioFreq = document.getElementById('radioFreq'),
    speakerButton = document.getElementById('speakerButton');

var gDefaultFreq = 80.0,  // Tokyo FM
    gDefaultArea = 'TOKYO',
    gCurrentFreq = gDefaultFreq,
    gCurrentArea = gDefaultArea;

// Stations data will loaded from stations.json
var Stations = {};

function init() {
  speechSomething("Tokyo Radio'chan");
  if (!checkDeviceStatus()) {
    changeRadioStatus('UNAVAILABLE');
    return;
  }
/*
  AirplaneModeHelper.addEventListener('statechange', function(status) {
    airplaneModeEnabled = status === 'enabled';
    if (airplaneModeEnabled) {
      changeRadioStatus('AIRPLANE');
    }
  });
*/
  fmRadio.onantennaavailablechange = onAntennaChange;
  fmRadio.onfrequencychange = onFreqChange;
  fmRadio.onenabled = function() {
    changeRadioStatus('PLAY');
  };
  fmRadio.ondisabled = function() {
    // ondisabled function.
  };
  speakerManager.onspeakerforcedchange = onSpeakerForcedChange;

  ctrlContainer.addEventListener('click', clickHandler, false);
  speakerButton.addEventListener('click', toggleSpeaker, false);

  console.log('RDS reception? ', fmRadio.rdsEnabled);
}


function checkDeviceStatus() {
  // Check navigator.mozFMRadio.
  if (navigator.mozFMRadio) {
    fmRadio = navigator.mozFMRadio;
    gMinFreq = fmRadio.frequencyLowerBound;
    gMaxFreq = fmRadio.frequencyUpperBound;
  } else {
    console.error('Your device has no FM radio feature.');
    return false;
  }

  // Check frequency settings.
  console.log('Radio Freq: ' + gMinFreq + ' - ' + gMaxFreq);
  if (gMinFreq > 76.0 || gMaxFreq < 90.0) {
    console.error('You cannot set proper radio frequency.');
    return false;
  }
/*
  var lock = navigator.mozSettings.createLock();
  var setting = lock.get('dom.fmradio.band');
  setting.onsuccess = function () {
    console.log('dom.fmradio.band: ' + setting.result);  // must be '2'.
  };
  setting.onerror = function () {
    console.warn('An error occured: ' + setting.error);
  };
*/

  // Check MozSpeakerManager.
  if (MozSpeakerManager) {
    speakerManager = new MozSpeakerManager();
    isOutput2Speaker = speakerManager.speakerforced;
  } else {
    console.error('Your device has no control for speaker output.');
  }

  // Check antenna.
  if (!fmRadio.antennaAvailable) {
    console.error('No antenna.');
    changeRadioStatus('NOANTENNA');
  }
  return true;
}

function clickHandler(ev) {
  ev.preventDefault();
  switch (ev.target.id) {
    case 'powerButton':
      togglePower();
      break;
    case 'seekDown':
      changeRadioStatus('SEEK');
      seekTo('down');
      break;
    case 'seekUp':
      changeRadioStatus('SEEK');
      seekTo('up');
      break;
    default:
      console.log('Clicked target is ' + ev.target.id);
  }
}


function togglePower() {
  if (fmRadio.enabled) {
    fmRadio.disable();
    changeRadioStatus('STOP');
    console.log('fmRadio: Disabled.');
  } else {
    if (fmRadio.antennaAvailable) {
      changeRadioStatus('SEEK');
      enableFMRadio(gCurrentFreq);
    } else {
      changeRadioStatus('NOANTENNA');
      console.log('No antenna.');
    }
  }
}

function enableFMRadio(aFreq) {
  var req = fmRadio.enable(aFreq);
  req.onsuccess = function () {
    console.log('fmRadio: Enabled.');
  };
  req.onerror = function (err) {
    changeRadioStatus('UNAVAILABLE');
    console.error('fmRadio: Cannot enable.', err);
  };
}


function seekTo(aDir) {
  var cancel, search;
  if (!fmRadio.antennaAvailable) {
    changeRadioStatus('NOANTENNA');
    console.log('No antenna.');
    return;
  }
  if (isSeeking) {
    cancel = fmRadio.cancelSeek();
    cancel.onsuccess = function () {
      isSeeking = false;
      seekTo(aDir);
    };
  } else {
    if (!fmRadio.enabled) {
      enableFMRadio(gCurrentFreq);
    } else {
      if (aDir === 'up') {
        search = fmRadio.seekUp();
      } else if (aDir === 'down') {
        search = fmRadio.seekDown();
      }
    }
  }

  if (search) {
    search.onsuccess = function () {
      isSeeking = true;
    };
    search.onerror = function () {
      seekTo(aDir);
    };
  }
}

function stationTo(aTargetFreq) {
  var area = Stations[gCurrentArea];
  if (!area[gCurrentFreq]) {
    console.error('Station not found: ' + aTargetFreq + 'MHz');
    return;
  }

  if (aTargetFreq !== gCurrentFreq) {
    var change = fmRadio.setFrequency(aTargetFreq);
    change.onsuccess = function () {
      gCurrentFreq = aTargetFreq;
      console.log('Current frequency is ' + fmRadio.frequency + 'MHz.');
    };
    change.onerror = function () {
      console.error('Target Frequency is out of range:' + aTargetFreq + ' [' + gMinFreq + ',' + gMaxFreq + ']');
    };
  } else {
    console.log('Current frequency is ' + fmRadio.frequency + 'MHz.');
  }
}

function onAntennaChange() {
  if (fmRadio.antennaAvailable) {
    console.log('antenna: Plugged in.');
    changeRadioStatus('RECOVER');
  } else {
    console.log('antenna: Plugged out.');
    if (fmRadio.enabled) {
      fmRadio.disable();
      if (speakerManager.speakerforced) {
        speakerManager.forcespeaker = false;
      }
    }
    changeRadioStatus('ERROR');
  }
}

function onFreqChange() {
  isSeeking = false;
  gCurrentFreq = fmRadio.frequency.toFixed(1);
  console.log('Current frequency: ' + gCurrentFreq + 'MHz.');
  changeRadioStatus('PLAY');
  showRadioFrequency(gCurrentFreq);
  showStationInfo(gCurrentArea);
}


function showRadioFrequency(aFreq) {
  radioFreq.textContent = aFreq + ' MHz';
}

function showStationInfo(aArea) {
  var radioStation = document.getElementById('radioStation'),
      timetable = document.getElementById('timetable'),
      twitter = document.getElementById('twitter'),
      area = (aArea ? Stations[aArea] : Stations.TOKYO);
  if (gCurrentFreq in area) {
    var station = area[gCurrentFreq];
    radioStation.textContent = station.name;
    if (station.timetable.length > 0) {
      timetable.setAttribute('href', station.timetable);
      timetable.style.visibility = 'visible';
    } else {
      timetable.style.visibility = 'hidden';
    }
    if (station.twitter.length > 0) {
      twitter.setAttribute('href', 'https://twitter.com/' + station.twitter);
      twitter.style.visibility = 'visible';
    } else {
      twitter.style.visibility = 'hidden';
    }
  } else {
    radioStation.textContent = "?";
    timetable.style.visibility = 'hidden';
    twitter.style.visibility = 'hidden';
  }
}

function changeRadioStatus(aStatus) {
  var spText = '';
  if (aStatus) {
    radioStatus.hidden = false;
  }
  switch(aStatus) {
    case 'SEEK':
      radioStatus.textContent = '💫';  // Dizzy Symbol: &#x1f4ab;
      radioStatus.setAttribute('aria-label', 'Seeking');
      spText = "Seeking.";
      break;
    case 'PLAY':
      radioStatus.textContent = '🎵';  // Musical Note: &#x1f3b5;
      radioStatus.setAttribute('aria-label', 'Listening');
      break;
    case 'STOP':
      radioStatus.textContent = '💤';  // Sleeping Symbol:  &#x1f4a4;
      radioStatus.setAttribute('aria-label', 'Sleeping');
      spText = "Sleepy.";
      break;
    case 'ERROR':
      radioStatus.textContent = '💔';  // Broken Heart: &#x1f494;
      radioStatus.setAttribute('aria-label', 'Antenna is unplugged');
      spText = "Miss you.";
      changeWallpaper(false);
      break;
    case 'RECOVER':
      radioStatus.textContent = '💖';  // Sparkling Heart: &#x1f496;
      radioStatus.setAttribute('aria-label', 'Antenna is plugged');
      spText = "Happy.";
      window.setTimeout(function() {
        changeRadioStatus();
      }, 1200);
      changeWallpaper(true);
      break;
    case 'NOANTENNA':
      radioStatus.textContent = '🎧';  // Headphone: &#x1f3a7;
      radioStatus.setAttribute('aria-label', 'Please plugin your headset');
      spText = "No antenna.";
      changeWallpaper(false);
      break;
    case 'UNAVAILABLE':
      radioStatus.textContent = '🚫';  // No Entry Sign: &#x1f6ab;
      radioStatus.setAttribute('aria-label', 'Radio-chan doesn\'t work.');
      spText = "Sorry, unavailable.";
      changeWallpaper(false);
      break;
    case 'AIRPLANE':
      radioStatus.textContent = '📵';  // No Mobile Phones: &#x1f4f5;
      radioStatus.setAttribute('aria-label', 'Airplane mode is enabled.');
      break;
    default:
      radioStatus.hidden = true;  // No emotion.
      radioStatus.setAttribute('aria-label', '');
  }
  if (spText.length > 0) {
    speechSomething(spText);
  }
}


function toggleSpeaker() {
  speakerManager.forcespeaker = !speakerManager.speakerforced;
}

function onSpeakerForcedChange() {
  if (speakerManager.speakerforced !== isOutput2Speaker) {
    var iconImg = document.getElementById('speakerIcon');
    if (speakerManager.speakerforced) {
      console.log('Output to speaker.');
      isOutput2Speaker = true;
      iconImg.src = './style/speaker_on.png';
      //iconImg.textContent = '🔊';  // on: &#x1f50a; Speaker With Three Sound Waves
    } else {
      isOutput2Speaker = false;
      console.log('Output to headphone.');
      iconImg.src = './style/speaker_off.png';
      //iconImg.textContent = '🔈';  // off: &#x1f508; Speaker
    }
  }
}


function speechSomething(aText) {
  if (!speachEnabled) {
    return;
  }
  var sp = new SpeechSynthesisUtterance();
  sp.text = aText;
  sp.lang = "en-GB";  // fr-FR, en-US, de-DE, en-GB, es-ES, it-IT
  sp.volume = 0.6;  // 0.0 - 1.0 [1.0]
  sp.rate = 1.1;    // 0.0 - 10.0 [1.0]
  sp.pitch = 1.4;   // 0.0 - 2.0 [1.0]

  sp.onstart = function () {
    console.log('Radio-chan says: ', sp.text);
  };
  speechSynthesis.speak(sp);
}


function changeWallpaper(isPlayable) {
  var WallPapers = [
    "seamless-butterfly",
    "hearts-and-swirls",
    "spring-floral",
    "vintage-phonograph",
    "cute-ladybug",
    "christmas-gift-wrap",
    "starfield-background",
    "cute-stars-pattern"
  ];

  if (isPlayable) {
    var n = Math.floor(Math.random() * WallPapers.length),
        wp_name = WallPapers[n];
    document.body.style.backgroundImage = "url(\'/style/wallpapers/" + wp_name + ".png\')";
  } else {
    document.body.style.backgroundImage = 'none';
  }
}

// Load JSON file.
function loadJsonFile(url) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.overrideMimeType('application/json; charset=utf-8');
    xhr.onload = function() {
      if (xhr.readyState === 4) {
        if (xhr.status !== 404 && xhr.response !== null) {
          resolve(xhr.response);
        } else {
          reject(xhr.statusText);
        }
      }
    };
    xhr.send();
  });
}


function loadStatus() {
  var stor_freq = localStorage.getItem('freq'),  // typeof freq = 'string'
      stor_area = localStorage.getItem('area');
  gCurrentFreq = stor_freq ? parseFloat(stor_freq).toFixed(1) : gDefaultFreq;
  gCurrentArea = (stor_area in Stations) ? stor_area : gDefaultArea;
  //console.log('Current Status:', gCurrentFreq, gCurrentArea);
}

function saveStatus(aFreq, aArea) {
  if (aFreq && (gMinFreq <= aFreq || aFreq <= gMaxFreq)) {
    localStorage.setItem('freq', aFreq);
    localStorage.setItem('area', aArea);
  } else {
    console.warn('Given frequency is out of range:', aFreq);
    localStorage.clear();
  }
}


window.addEventListener('load', function() {
  init();
/*
  AirplaneModeHelper.ready(function() {
    airplaneModeEnabled = AirplaneModeHelper.getStatus() == 'enabled';
  });
*/
  loadJsonFile('stations.json').then(function(stationData) {
    console.log('Station data has been loaded.');
    Stations = stationData;
    loadStatus();
    showRadioFrequency(gCurrentFreq);
    showStationInfo(gCurrentArea);
  }).catch(function (e) {
    console.error(e);
  });
}, false);

window.addEventListener('unload', function() {
  saveStatus(gCurrentFreq, gCurrentArea);
  fmRadio.disable();
  ctrlContainer.removeEventListener('click', clickHandler, false);
  speakerButton.removeEventListener('click', toggleSpeaker, false);
}, false);

})(window);
