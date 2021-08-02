/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
function details() {
  return {
    id: 'Tdarr_Plugin_GR34_GrutOrderStreams',
    Stage: 'Pre-processing',
    Name: 'Grut-Order Streams by channel and by lang',
    Type: 'Streams',
    Operation: 'Order',
    Description: `Orders streams into Video first, then Audio (2ch, 6ch, 8ch) and finally Subtitles.\n
                  Audio stream are also ordered by language (in each category 2ch, 6ch, 8ch), according to the specified parameter.\n\n
                  This plugin is based on Tdarr_Plugin_MC93_Migz6OrderStreams. \n\n`,
    Version: '0.1',
    Tags: 'pre-processing,audio,order,configurable',
    Inputs: [
      {
        name: 'lang_order',
        tooltip: `Specify language order. Each language is separated by a comma.
              \\nOptional.
              \\nExample:\\n
              fre,eng

              \\nNote:\\n
              All other language will be considered as undefined and placed after the specified language. For example, spanish will be after french and english\\n
              If no language is specified, the behaviours is similar to Tdarr_Plugin_MC93_Migz6OrderStreams`,
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
  prefix=new Date().toISOString()+ " - " + "Tdarr_Plugin_GR34_GrutOrderStreams - "
  if(debug)
    console.log(prefix+message)
}

function plugin(file, librarySettings, inputs) {
  const response = {
    processFile: false,
    preset: '',
    container: `.${file.container}`,
    handBrakeMode: false,
    FFmpegMode: true,
    infoLog: '',
  };

  let lang_order=''

  if (inputs && inputs.lang_order === '')
    lang_order="und"
  else lang_order=inputs.lang_order+',und'
  lang_order_array=lang_order.split(',')

  let debug=false
  if (inputs && inputs.debug && inputs.debug.toLowerCase() === 'true')
    debug=true 
  // Set up required variables.
  let ffmpegCommandInsert = '';
  let audioIdx = 0;
  let audio6Idx = 0;
  let audio8Idx = 0;
  let subtitleIdx = 0;
  let convert = false;

  
  // init array required to manage language sorting
  let audioLangIndex = {}
  let audioIdxLang = []
  let audio6IdxLang = []
  let audio8IdxLang = []
  let stream_language_array=[]
  for (let i=0;i<lang_order_array.length;i++){
    audioLangIndex[lang_order_array[i]]=i
    audioIdxLang[i]=0
    audio6IdxLang[i]=0
    audio8IdxLang[i]=0
  }
  print_debug(debug,'###### Processing '+file.file)
  // Go through each stream in the file.
  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    try {
      // Check if stream is video.
      print_debug(debug,"Stream "+i+" is "+ file.ffProbeData.streams[i].codec_type)
      if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'video') {
        // Check if audioIdx or subtitleIdx do NOT equal 0
        //  If so then it means a audio or subtitle track has already appeared before the video track
        // So file needs to be organized.
        if (audioIdx !== 0 || subtitleIdx !== 0) {
          convert = true;
          response.infoLog += '☒ Video not first. \n';
        }
      }

      // Check if stream is audio.
      if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio') {
        // Identify audio language
        language="und"
        if(("tags" in file.ffProbeData.streams[i]) && ("language" in file.ffProbeData.streams[i].tags)){
            print_debug(debug,"Stream "+i+" - Found language : "+  file.ffProbeData.streams[i].tags.language);
            language=file.ffProbeData.streams[i].tags.language
        }
        // if the language is not specified in inputs.lang_order, it's set to 'und'
        if(! lang_order_array.includes(language)) language='und'
        print_debug(debug,"Stream "+i+" - Found final language : "+language)
        stream_language_array[i]=language

        // Check if subtitleIdx does NOT equal 0.
        // If so then it means a subtitle track has already appeared before an audio track
        // So file needs to be organized.
        if (subtitleIdx !== 0) {
          convert = true;
          response.infoLog += '☒ Audio not second. \n';
          print_debug(debug,'    ☒ Audio not second.');
        }
        // Increment audioIdx.
        audioIdx += 1;

        // Check if audio track is 2 channel.
        if (file.ffProbeData.streams[i].channels === 2) {
          // Check if audio6Idx or audio8Idx do NOT equal 0.
          // If so then it means a 6 or 8 channel audio track has already appeared before the 2 channel audio track
          // So file needs to be organized.
          print_debug(debug,"    Stream "+i+" is 2 channel")
          
          if (audio6Idx !== 0 || audio8Idx !== 0) {
            convert = true;
            response.infoLog += '☒ Audio 2ch not first. \n';
            print_debug(debug,'    ☒ Audio 2ch not first.');
          }

          // Check if this 2ch stream is in correct position, according to its language
          let langIdx=audioLangIndex[language]
          let sliced_audioIdxLang=audioIdxLang.slice(langIdx+1)
          let found_value=sliced_audioIdxLang.find(element => element > 0)
          if( found_value !== undefined){
            convert = true;
            response.infoLog += '☒ Audio 2ch '+language+' not at the right place. Should be in position '+(langIdx+1)+' of 2ch audio\n';
            print_debug(debug,'    ☒ Audio 2ch '+language+' not at the right place. Should be in position '+(langIdx+1)+' of 2ch audio');
          }

          audioIdxLang[langIdx] += 1
        }
        // Check if audio track is 6 channel.
        if (file.ffProbeData.streams[i].channels === 6) {
          print_debug(debug,"    Stream "+i+" is 6 channel")
          // Check if audio8Idx does NOT equal 0.
          // If so then it means a 8 channel audio track has already appeared before the 6 channel audio track
          // So file needs to be organized.
          if (audio8Idx !== 0) {
            convert = true;
            response.infoLog += '☒ Audio 6ch not second. \n';
            print_debug(debug,'     ☒ Audio 6ch not first.');
          }

          // Check if this 6ch stream is in correct position, according to its language
          let langIdx=audioLangIndex[language]
          let sliced_audio6IdxLang=audio6IdxLang.slice(langIdx+1)
          let found_value=sliced_audio6IdxLang.find(element => element > 0)
          if( found_value !== undefined){
            convert = true;
            response.infoLog += '☒ Audio 6ch '+language+' not at the right place. Should be in position '+(langIdx+1)+' of 6ch audio \n';
            print_debug(debug,'    ☒ Audio 6ch '+language+' not at the right place. Should be in position '+(langIdx+1)+' of 6ch audio');
          }

          audio6IdxLang[langIdx] += 1
          // Increment audio6Idx.
          audio6Idx += 1;
        }

        // Check if audio track is 8 channel.
        if (file.ffProbeData.streams[i].channels === 8) {
          print_debug(debug,"    Stream "+i+" is 8 channel")
          // Check if this 2ch stream is in correct position, according to its language
          let langIdx=audioLangIndex[language]
          let sliced_audio8IdxLang=audio8IdxLang.slice(langIdx+1)
          let found_value=sliced_audio8IdxLang.find(element => element > 0)
          if( found_value !== undefined){
            convert = true;
            response.infoLog += '☒ Audio 8ch '+language+' not at the right place. Should be in position '+(langIdx+1)+' of 8ch audio \n';
            print_debug(debug,'    ☒ Audio 8ch '+language+' not at the right place. Should be in position '+(langIdx+1)+' of 8ch audio');
          }

          audio8IdxLang[langIdx] += 1     
          // Increment audio8Idx.
          audio8Idx += 1;
        }
      }

      // Check if stream is subtitle.
      if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'subtitle') {
        // Increment subtitleIdx
        subtitleIdx += 1;
      }
    } catch (err) {
      print_debug(debug,"Caught an error")
      print_debug(debug,err)
    }
    print_debug(debug,'--------------------------------------------------------------')
  }
  
  // Go through each stream in the file.
  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    try {
      // Check if stream is video AND is not a mjpeg.
      if (
        file.ffProbeData.streams[i].codec_type.toLowerCase() === 'video'
        && file.ffProbeData.streams[i].codec_name.toLowerCase() !== 'mjpeg'
      ) {
        ffmpegCommandInsert += `-map 0:${i} `;
      }
    } catch (err) {
      print_debug(debug,"Caught an error")
      print_debug(debug,err)
    }
  }

  // Go through each stream in the file.
  let audioordered=[]
  for(let j = 0; j<lang_order_array.length;j++){
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      try {
        // Check if stream is audio AND 2 channel.
        if (
          file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
          && file.ffProbeData.streams[i].channels === 2
          && stream_language_array[i] === lang_order_array[j]
        ) {
          audioordered.push(`-map 0:${i}`)
          
        }
      } catch (err) {
        print_debug(debug,"Caught an error")
        print_debug(debug,err)
      }
    }
  }
  if (audioordered.length>0)
    ffmpegCommandInsert += audioordered.join(' ')+' ';
  print_debug(debug,ffmpegCommandInsert)
  
  // Go through each stream in the file.
  audioordered=[]
  for(let j = 0; j<lang_order_array.length;j++){
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      try {
        // Check if stream is audio AND 2 channel.
        if (
          file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
          && file.ffProbeData.streams[i].channels === 6
          && stream_language_array[i] === lang_order_array[j]
        ) {
          audioordered.push(`-map 0:${i}`)
          
        }
      } catch (err) {
        print_debug(debug,"Caught an error")
        print_debug(debug,err)
      }
    }
  }
  if (audioordered.length>0)
    ffmpegCommandInsert += audioordered.join(' ')+' ';
  print_debug(debug,ffmpegCommandInsert)
  
  // Go through each stream in the file.
  audioordered=[]
  for(let j = 0; j<lang_order_array.length;j++){
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      try {
        // Check if stream is audio AND 2 channel.
        if (
          file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
          && file.ffProbeData.streams[i].channels === 8
          && stream_language_array[i] === lang_order_array[j]
        ) {
          audioordered.push(`-map 0:${i}`)
          
        }
      } catch (err) {
        print_debug(debug,"Caught an error")
        print_debug(debug,err)
      }
    }
  }
  if (audioordered.length>0)
    ffmpegCommandInsert += audioordered.join(' ')+' ';
  print_debug(debug,ffmpegCommandInsert)
  

  // Go through each stream in the file.
  audioordered=[]
  for(let j = 0; j<lang_order_array.length;j++){
    for (let i = 0; i < file.ffProbeData.streams.length; i++) {
      try {
        // Check if stream is audio AND not 2, 6 or 8 channel.
        if (
          file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
          && file.ffProbeData.streams[i].channels !== 2
          && file.ffProbeData.streams[i].channels !== 6
          && file.ffProbeData.streams[i].channels !== 8
        ) {
          audioordered.push(`-map 0:${i}`)
          
        }
      } catch (err) {
        print_debug(debug,"Caught an error")
        print_debug(debug,err)
      }
    }
  }

  if (audioordered.length>0)
    ffmpegCommandInsert += audioordered.join(' ')+' ';
  print_debug(debug,ffmpegCommandInsert)
  
  // Go through each stream in the file.
  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    try {
      // Check if stream is subtitle.
      if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'subtitle') {
        ffmpegCommandInsert += `-map 0:${i} `;
      }
    } catch (err) {
    // Error
    }
  }
  print_debug(debug,ffmpegCommandInsert)
  
  
  // Convert file if convert variable is set to true.
  if (convert === true) {
    response.processFile = true;
    response.preset = `,${ffmpegCommandInsert} -c copy -max_muxing_queue_size 9999`;
    response.reQueueAfter = true;
    response.infoLog += '☒ Streams are out of order, reorganizing streams. Video, Audio, Subtitles. \n';
    print_debug(debug,'☒ Streams are out of order, reorganizing streams. Video, Audio, Subtitles.');
    print_debug(debug,'ffmpeg command: '+response.preset)
  } else {
    response.infoLog += '☑ Streams are in expected order. \n ';
    print_debug(debug,'☑ Streams are in expected order.');
    response.processFile = false;
  }
  print_debug(debug,'###### End Processing '+file.file)
  print_debug(debug,'')
  print_debug(debug,'')
  
  return response;
}
module.exports.details = details;
module.exports.plugin = plugin;
