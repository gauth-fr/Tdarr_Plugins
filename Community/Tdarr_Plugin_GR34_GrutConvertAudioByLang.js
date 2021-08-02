/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
function details() {
  return {
    id: 'Tdarr_Plugin_GR34_GrutConvertAudioByLang',
    Stage: 'Pre-processing',
    Name: 'Grut-Convert audio streams by lang',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: 'This plugin can convert any 2.0 audio track/s to AAC and can create downmixed audio tracks for each language. In any case, it will create a 2 channels for each available language\n This plugin is based on Tdarr_Plugin_MC93_Migz5ConvertAudio. \n\n',
    Version: '0.1',
    Link: '',
    Tags: 'pre-processing,ffmpeg,audio only,configurable',
    Inputs: [{
        name: 'aac_stereo',
        tooltip: `Specify if any 2.0 audio tracks should be converted to aac for maximum compatability with devices.
                      \\nOptional.
              \\nExample:\\n
              true

              \\nExample:\\n
              false`,
      },
      {
        name: 'downmix',
        tooltip: `Specify if downmixing should be used to create extra audio tracks.
                      \\nI.e if you have an 8ch but no 2ch or 6ch, create the missing audio tracks from the 8 ch.
                      \\nLikewise if you only have 6ch, create the missing 2ch from it. Optional.
              \\nExample:\\n
              true

              \\nExample:\\n
              false`,
      },
      {
        name: 'debug',
        tooltip: `print some debug output in node log (ie docker logs...).
              \\nOptional.
              \\nExample:\\n
              true
              \\nExample:\\n
              false
              \\nDefault:\\n
              false
              `,
      },
    ],
  };
}

function print_debug(debug, message) {
  prefix=new Date().toISOString()+ " - " + "Tdarr_Plugin_GR34_GrutConvertAudioByLang - "
  if(debug)
    console.log(prefix+message)
}

function plugin(file, librarySettings, inputs) {
  const response = {
    processFile: false,
    container: `.${file.container}`,
    handBrakeMode: false,
    FFmpegMode: true,
    reQueueAfter: true,
    infoLog: '',
  };

  //  Check if both inputs.aac_stereo AND inputs.downmix have been left empty. If they have then exit plugin.
  if (inputs && inputs.aac_stereo === '' && inputs.downmix === '') {
    response.infoLog += '☒Plugin has not been configured, please configure required options. Skipping this plugin. \n';
    response.processFile = false;
    return response;
  }

  let debug=false
  if (inputs && inputs.debug && inputs.debug.toLowerCase() === 'true')
    debug=true 

  // Check if file is a video. If it isn't then exit plugin.
  if (file.fileMedium !== 'video') {
    // eslint-disable-next-line no-console
    console.log('File is not video');
    response.infoLog += '☒File is not video. \n';
    response.processFile = false;
    return response;
  }

  // Set up required variables.
  let ffmpegCommandInsert = '';
  let audioIdx = 0;
  let has2Channel = false;
  let has6Channel = false;
  let has8Channel = false;
  let convert = false;

  audioTracksByLang={}

  print_debug(debug,'###### Processing '+file.file)
  // Go through each stream in the file.
  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    try {
      print_debug(debug,"Stream "+i+" is "+ file.ffProbeData.streams[i].codec_type)
      // Go through all audio streams and check if 2,6 & 8 channel tracks exist or not.
      if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio') {
        language="und"
        if(("tags" in file.ffProbeData.streams[i]) && ("language" in file.ffProbeData.streams[i].tags)){
            language=file.ffProbeData.streams[i].tags.language
        }
        print_debug(debug,"    Found language : "+  file.ffProbeData.streams[i].tags.language);

        if(!(language in audioTracksByLang)) {
          print_debug(debug, "    Dictionnary doesn't exist. Create dictionnary for lang " + language)
          audioTracksByLang[language]={
            has2Channel:false,
            has6Channel:false,
            has8Channel:false
          }
        }
    
        if (file.ffProbeData.streams[i].channels === 2) {
          has2Channel = true;
          audioTracksByLang[language]["has2Channel"]=true;
          print_debug(debug, "    Stream has 2 channels")
        }
        if (file.ffProbeData.streams[i].channels === 6) {
          has6Channel = true;
          audioTracksByLang[language]["has6Channel"]=true;
          print_debug(debug, "    Stream has 6 channels")
        }
        if (file.ffProbeData.streams[i].channels === 8) {
          has8Channel = true;
          audioTracksByLang[language]["has8Channel"]=true;
          print_debug(debug, "    Stream has 8 channels")
        }
      }
    } catch (err) {
      // Error
      print_debug(debug,"An error occured")
      print_debug(debug,err)
    }
  }

  print_debug(debug,"Available audio track by lang : ")
  // console.log(audioTracksByLang)
  print_debug(debug,JSON.stringify(audioTracksByLang))

  // Go through each stream in the file.
  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    print_debug(debug,"Stream "+i+" is "+ file.ffProbeData.streams[i].codec_type)
    // Check if stream is audio.
    if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio') {
      // Catch error here incase user left inputs.downmix empty.
      language="und"
      if(("tags" in file.ffProbeData.streams[i]) && ("language" in file.ffProbeData.streams[i].tags)){
          language=file.ffProbeData.streams[i].tags.language
      }
      try {
        // Check if inputs.downmix is set to true.
        if (inputs.downmix.toLowerCase() === 'true') {
          // Check if file has 8 channel audio but no 6 channel, if so then create extra downmix from the 8 channel.
          if (
            audioTracksByLang[language]["has8Channel"] === true
            && audioTracksByLang[language]["has6Channel"] === false
            && file.ffProbeData.streams[i].channels === 8
          ) {
            ffmpegCommandInsert += `-map 0:${i} -c:a:${audioIdx} ac3 -ac 6 -metadata:s:a:${audioIdx} title=${language.toUpperCase()}-5.1-AAC `;
            response.infoLog += '☒'+language+' Audio track ("Stream '+i+'") is 8 channel, no 6 channel exists. Creating 6 channel from 8 channel. \n';
            print_debug(debug,'    ☒'+language+' Audio track ("Stream '+i+'") is 8 channel, no 6 channel exists. Creating 6 channel from 8 channel.');
            convert = true;
          }
          // Check if file has 6 channel audio but no 2 channel, if so then create extra downmix from the 6 channel.
          if (
            audioTracksByLang[language]["has6Channel"] === true
            &&  audioTracksByLang[language]["has2Channel"] === false
            && file.ffProbeData.streams[i].channels === 6
          ) {
            ffmpegCommandInsert += `-map 0:${i} -c:a:${audioIdx} aac -ac 2 -metadata:s:a:${audioIdx} title=${language.toUpperCase()}-2.0-AAC `;
            response.infoLog += '☒'+language+' Audio track ("Stream '+i+'") is 6 channel, no 2 channel exists. Creating 2 channel from 6 channel. \n';
            print_debug(debug,'    ☒'+language+' Audio track ("Stream '+i+'") is 6 channel, no 2 channel exists. Creating 2 channel from 6 channel.');
            convert = true;
          }
        }
        else{
          //No downmix required but we still want Stereo (for each language)
          if(audioTracksByLang[language]["has2Channel"] === false){
            response.infoLog += '☒No Downmix is required but we still want a stereo track for each language.';
            print_debug(debug,'    ☒No Downmix is required but we still want a stereo track for each language.\n');
            if (
              audioTracksByLang[language]["has8Channel"] === true
              && audioTracksByLang[language]["has6Channel"] === false
              && file.ffProbeData.streams[i].channels === 8
            ) {
              ffmpegCommandInsert += `-map 0:${i} -c:a:${audioIdx} aac -ac 2 -metadata:s:a:${audioIdx} title=${language.toUpperCase()}-2.0-AAC `;
              response.infoLog += '☒'+language+' Audio track ("Stream '+i+'") is 8 channel, no 6 channel exists, no 2 channel exists. Creating 2 channel from 8 channel. \n';
              print_debug(debug,'    ☒'+language+' Audio track ("Stream '+i+'") is 8 channel, no 6 channel exists, no 2 channel exists. Creating 2 channel from 8 channel.');
              convert = true;
            }
            if (
              audioTracksByLang[language]["has6Channel"] === true
              && file.ffProbeData.streams[i].channels === 6
            ) {
              ffmpegCommandInsert += `-map 0:${i} -c:a:${audioIdx} aac -ac 2 -metadata:s:a:${audioIdx} title=${language.toUpperCase()}-2.0-AAC `;
              response.infoLog += '☒'+language+' Audio track ("Stream '+i+'") is 6 channel, no 2 channel exists. Creating 2 channel from 6 channel. \n';
              print_debug(debug,'    ☒'+language+' Audio track ("Stream '+i+'") is 6 channel exists, no 2 channel exists. Creating 2 channel from 6 channel.');
              convert = true;
            }          
          }
        }
      } catch (err) {
        // Error
      }

      // Catch error here incase user left inputs.downmix empty.
      try {
        // Check if inputs.aac_stereo is set to true.
        if (inputs.aac_stereo.toLowerCase() === 'true') {
          // Check if codec_name for stream is NOT aac AND check if channel ammount is 2.
          if (
            file.ffProbeData.streams[i].codec_name !== 'aac'
            && file.ffProbeData.streams[i].channels === 2
          ) {
            ffmpegCommandInsert += `-c:a:${audioIdx} aac `;
            response.infoLog += '☒'+language+' Audio track ("Stream '+i+'") is 2 channel but is not AAC. Converting. \n';
            print_debug(debug,'    ☒'+language+' Audio track ("Stream '+i+'") is 2 channel but is not AAC. Converting.');
            convert = true;
          }
        }
      } catch (err) {
        // Error
      }
      audioIdx += 1;
    }
  }
  print_debug(debug,"ffmpegCommandInsert :"+ffmpegCommandInsert)
  
  // Convert file if convert variable is set to true.
  if (convert === true) {
    response.processFile = true;
    response.preset = `, -map 0 -c:v copy -c:a copy ${ffmpegCommandInsert} `
    + '-strict -2 -c:s copy -max_muxing_queue_size 9999 ';
    print_debug(debug,'ffmpeg command: '+response.preset)
  } else {
    response.infoLog += '☑File contains all required audio formats. \n';
    print_debug(debug,'☑File contains all required audio formats.')
    response.processFile = false;
  }
  print_debug(debug,'###### End Processing '+file.file)
  print_debug(debug,'')
  print_debug(debug,'')
  
  return response;
}
module.exports.details = details;
module.exports.plugin = plugin;
