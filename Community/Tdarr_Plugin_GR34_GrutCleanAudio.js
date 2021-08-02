/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
function details() {
  return {
    id: 'Tdarr_Plugin_GR34_GrutCleanAudio',
    Stage: 'Pre-processing',
    Name: 'Grut-Clean audio streams',
    Type: 'Audio',
    Operation: 'Clean',
    Description: 'This plugin keeps only specified language tracks & can tags tracks with  an unknown language. Can also exclude audio track with specific keywords in their title \n\n',
    Version: '0.1',
    Link: '',
    Tags: 'pre-processing,ffmpeg,audio only,configurable',
    Inputs: [{
      name: 'language',
      tooltip: `Specify language tag/s here for the audio tracks you'd like to keep
               \\nRecommended to keep "und" as this stands for undertermined
               \\nSome files may not have the language specified.
               \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
               \\nExample:\\n
               eng

               \\nExample:\\n
               eng,und

               \\nExample:\\n
               eng,und,jap`,
    },
    {
      name: 'commentary',
      tooltip: `Specify if audio tracks that contain commentary/description should be removed.
               \\nExample:\\n
               true

               \\nExample:\\n
               false`,
    },
    {
      name: 'remove_title_with',
      tooltip: `audio tracks that have title containing one of the keyword will be deleted (No matter what the language is, except if this is the only track in this language (and number of channels)).
               \\nCan specify many keywords, comma sperated.
               \\blank to skip keyword detection.
               \\nExample:\\n
               VFQ,VFF
               `

    },
    {
      name: 'tag_language',
      tooltip: `Specify a single language for audio tracks with no language or unknown language to be tagged with.
                    \\nYou must have "und" in your list of languages to keep for this to function.
                    \\nMust follow ISO-639-2 3 letter format. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
                    \\nLeave empty to disable.
               \\nExample:\\n
               eng

               \\nExample:\\n
               por`,
    },
    {
      name: 'tag_title',
      tooltip: `Specify audio tracks with no title to be tagged with the number of channels and codec they contain (5.1-11C).
           \\nDo NOT use this with mp4, as mp4 does not support title tags.
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
  prefix=new Date().toISOString()+ " - " + "Tdarr_Plugin_GR34_GrutCleanAudio - "
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
    reQueueAfter: false,
    infoLog: '',
  };

  // Check if file is a video. If it isn't then exit plugin.
  if (file.fileMedium !== 'video') {
    // eslint-disable-next-line no-console
    print_debug(debug,'File is not video');
    response.infoLog += '☒File is not video \n';
    response.processFile = false;
    return response;
  }

  // Check if inputs.language has been configured. If it hasn't then exit plugin.
  if (inputs.language === '') {
    response.infoLog += '☒Language/s options not set, please configure required options. Skipping this plugin.  \n';
    print_debug(debug,'☒Language/s options not set, please configure required options. Skipping this plugin.');
    response.processFile = false;
    return response;
  }

  let debug=false
  if (inputs && inputs.debug && inputs.debug.toLowerCase() === 'true')
    debug=true 

  let remove_title_with
  if (inputs.remove_title_with !== '') {
    remove_title_with=inputs.remove_title_with.toLowerCase().split(',');
  }
  
  print_debug(debug,'###### Processing '+file.file)
  // Set up required variables.
  const language = inputs.language.toLowerCase().split(',');
  let ffmpegCommandInsert = '';
  let convert = false;
  let audioIdx = 0;
  let audioStreamsRemoved = 0;

  audioWithLangDeleted=false
  audioStreamsByLang={}
  audioStreamsRemovedByLang={}
  ffmpegCommandInsertByLang={}

  for(let i=0;i<language.length;i++){
    audioStreamsByLang[i]=0
    audioStreamsRemovedByLang[i]=0
    ffmpegCommandInsertByLang[i]=""
  }

  audio_lang_struct=[]
  for(let i=0;i<language.length;i++){
    audio_lang_struct[i]=[]
  }

  const audioStreamCount = file.ffProbeData.streams.filter(
    (row) => row.codec_type.toLowerCase() === 'audio',
  ).length;

  for (let i = 0; i < file.ffProbeData.streams.length; i++) {
    // Catch error here incase the language metadata is completely missing.
    try {
      // Check if stream is audio
      // AND checks if the tracks language code does not match any of the languages entered in inputs.language.
      if ( file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio' ){
        if( language.indexOf(file.ffProbeData.streams[i].tags.language.toLowerCase()) === -1) {
          audioStreamsRemoved += 1;
          ffmpegCommandInsert += `-map -0:a:${audioIdx} `;

          response.infoLog += `☒Audio stream detected as being unwanted (unwanted language), removing. Audio stream 0:a:${audioIdx} \n`;
          print_debug(debug,`☒Audio stream detected as being unwanted (unwanted language), removing. Audio stream 0:a:${audioIdx}`);
          convert = true;
        }
        else {
          // Check the title of the stream to see if it contains an excluding keyword
          langIdx=language.indexOf(file.ffProbeData.streams[i].tags.language.toLowerCase())
          audioChannels=file.ffProbeData.streams[i].channels
          if(typeof audio_lang_struct[langIdx][audioChannels] === 'undefined') {
            audio_lang_struct[langIdx][audioChannels]={
                streamCount:0,
                deletedStreamCount:0,
                ffmpegCommandInsert:""
              }
          }
          audio_lang_struct[langIdx][audioChannels]["streamCount"]+=1
          if(inputs.remove_title_with !==""){
            for (var j = 0; j < remove_title_with.length; j++) {
              if (file.ffProbeData.streams[i].tags.title.toLowerCase().indexOf(remove_title_with[j]) > -1) {
                response.infoLog += `☒Audio stream detected as being unwanted (title contains ${remove_title_with[j]}), removing. Audio stream 0:a:${audioIdx} \n`;
                print_debug(debug,`☒Audio stream detected as being unwanted (title "${file.ffProbeData.streams[i].tags.title}" contains ${remove_title_with[j]}), removing. Audio stream 0:a:${audioIdx}`);
                audio_lang_struct[langIdx][audioChannels]["deletedStreamCount"]+=1
                audio_lang_struct[langIdx][audioChannels]["ffmpegCommandInsert"]+= `-map -0:a:${audioIdx} `;
                break;
              }
            }   
          }
        }
      }
      
    } catch (err) {
      // Error
    }

    // Catch error here incase the title metadata is completely missing.
    try {
      // Check if inputs.commentary is set to true
      // AND if stream is audio
      // AND then checks for stream titles with the following "commentary, description, sdh".
      // Removing any streams that are applicable.
      if (
        inputs.commentary.toLowerCase() === 'true'
        && file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
        && (file.ffProbeData.streams[i].tags.title
          .toLowerCase()
          .includes('commentary')
          || file.ffProbeData.streams[i].tags.title
            .toLowerCase()
            .includes('description')
          || file.ffProbeData.streams[i].tags.title.toLowerCase().includes('sdh'))
      ) {
        audioStreamsRemoved += 1;
        ffmpegCommandInsert += `-map -0:a:${audioIdx} `;
        response.infoLog += `☒Audio stream detected as being descriptive, removing. Stream 0:a:${audioIdx} \n`;
        print_debug(debug,`☒Audio stream detected as being descriptive, removing. Stream 0:a:${audioIdx}`);
        convert = true;
      }
    } catch (err) {
      // Error
    }


    
    // Check if inputs.tag_language has something entered
    // (Entered means user actually wants something to happen, empty would disable this)
    // AND checks that stream is audio.
    if (
      inputs.tag_language !== ''
      && file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
    ) {
      // Catch error here incase the metadata is completely missing.
      try {
        // Look for audio with "und" as metadata language.
        if (
          file.ffProbeData.streams[i].tags.language
            .toLowerCase()
            .includes('und')
        ) {
          ffmpegCommandInsert += `-metadata:s:a:${audioIdx} language=${inputs.tag_language} `;
          response.infoLog += `☒Audio stream detected as having no language, tagging as ${inputs.tag_language}. \n`;
          print_debug(debug,`☒Audio stream detected as having no language, tagging as ${inputs.tag_language}.`);
          convert = true;
        }
      } catch (err) {
        // Error
      }

      // Checks if the tags metadata is completely missing.
      // If so this would cause playback to show language as "undefined".
      // No catch error here otherwise it would never detect the metadata as missing.
      if (typeof file.ffProbeData.streams[i].tags === 'undefined') {
        ffmpegCommandInsert += `-metadata:s:a:${audioIdx} language=${inputs.tag_language} `;
        response.infoLog += `☒Audio stream detected as having no language, tagging as ${inputs.tag_language}. \n`;
        print_debug(debug,`☒Audio stream detected as having no language, tagging as ${inputs.tag_language}.`);
        convert = true;
      } else if (typeof file.ffProbeData.streams[i].tags.language === 'undefined') {
        // Checks if the tags.language metadata is completely missing.
        // If so this would cause playback to show language as "undefined".
        // No catch error here otherwise it would never detect the metadata as missing.
        ffmpegCommandInsert += `-metadata:s:a:${audioIdx} language=${inputs.tag_language} `;
        response.infoLog += `☒Audio stream detected as having no language, tagging as ${inputs.tag_language}. \n`;
        print_debug(debug,`☒Audio stream detected as having no language, tagging as ${inputs.tag_language}. `);
        convert = true;
      }
    }

    try {
      // Check if title metadata is missing from any streams
      // AND inputs.tag_title set to true AND if stream type is audio. Add title to any applicable streams.
      if (
        typeof file.ffProbeData.streams[i].tags.title === 'undefined'
        && inputs.tag_title.toLowerCase() === 'true'
        && file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio'
      ) {
        if(file.container !=="mp4"){
          streamLang=inputs.tag_language
          if (typeof file.ffProbeData.streams[i].tags !== 'undefined' && typeof file.ffProbeData.streams[i].tags.language !== 'undefined' && ! file.ffProbeData.streams[i].tags.language.toLowerCase().includes('und')) {
            streamLang=file.ffProbeData.streams[i].tags.language
          }
          print_debug(debug,`☒Stream language is ${streamLang}`);
          if(streamLang!=="") streamLang=streamLang+"-"
          if (file.ffProbeData.streams[i].channels === 8) {
            title=streamLang+"7.1-"+file.ffProbeData.streams[i].codec_name
            ffmpegCommandInsert += `-metadata:s:a:${audioIdx} title=${title} `;
            response.infoLog += `☒Audio stream detected as 8 channel with no title, tagging. Stream 0:a:${audioIdx} \n`;
            print_debug(debug,`☒Audio stream detected as 8 channel with no title, tagging. Stream 0:a:${audioIdx}`);
            convert = true;
          }
          if (file.ffProbeData.streams[i].channels === 6) {
            title=streamLang+"5.1-"+file.ffProbeData.streams[i].codec_name
            ffmpegCommandInsert += `-metadata:s:a:${audioIdx} title=${title.toUpperCase()} `;
            response.infoLog += `☒Audio stream detected as 6 channel with no title, tagging. Stream 0:a:${audioIdx} \n`;
            print_debug(debug,`☒Audio stream detected as 6 channel with no title, tagging. Stream 0:a:${audioIdx}`);
            convert = true;
          }
          if (file.ffProbeData.streams[i].channels === 2) {
            title=streamLang+"2.0-"+file.ffProbeData.streams[i].codec_name
            ffmpegCommandInsert += `-metadata:s:a:${audioIdx} title=${title} `;
            response.infoLog += `☒Audio stream detected as 2 channel with no title, tagging. Stream 0:a:${audioIdx} \n`;
            print_debug(debug,`☒Audio stream detected as 2 channel with no title, tagging. Stream 0:a:${audioIdx}`);
            convert = true;
          }
        }
        else{
          response.infoLog += `☒MP4 files badly support titles. Skipping.\n`;
          print_debug(debug,`☒MP4 files badly support titles. Skipping.`);
        }
      }
    } catch (err) {
      print_debug(debug,err)
    }

    // Check if stream type is audio and increment audioIdx if true.
    if (file.ffProbeData.streams[i].codec_type.toLowerCase() === 'audio') {
      audioIdx += 1;
    }
  }


  for(let langIdx=0;langIdx<language.length;langIdx++){
    item=audio_lang_struct[langIdx]
    for(let channels=0;channels<item.length;channels++){

    
      if(typeof item[channels] !== 'undefined'){
        itemChannel=item[channels]
        print_debug(debug,language[langIdx] +' '+channels+'ch - total: '+itemChannel["streamCount"]+', ddelete candidate: '+itemChannel["deletedStreamCount"]);
        
        if(itemChannel["deletedStreamCount"]>0){
          if(itemChannel["deletedStreamCount"]==itemChannel["streamCount"]){
            response.infoLog += '☒Won\'t delete any track in '+language[langIdx]+' '+channels+'ch or there won\'t be any track left.\n';
            print_debug(debug,'☒Won\'t delete any track in '+language[langIdx]+' '+channels+'ch or there won\'t be any track left.');
          }
          else{
            print_debug(debug,"☑Confirming deletion of "+language[langIdx]+' '+channels+'ch.');
            ffmpegCommandInsert+=` ${itemChannel["ffmpegCommandInsert"]}`
            audioStreamsRemoved += itemChannel["deletedStreamCount"]
            convert=true 
          }
        }
      }
    }
  }
  
  
  

  // Failsafe to cancel processing if all streams would be removed following this plugin. We don't want no audio.
  if (audioStreamsRemoved === audioStreamCount) {
    response.infoLog += '☒Cancelling plugin otherwise all audio tracks would be removed. \n';
    print_debug(debug,'☒Cancelling plugin otherwise all audio tracks would be removed.');
    response.processFile = false;

  }
  else{
    // Convert file if convert variable is set to true.
    if (convert === true) {
      response.processFile = true;
      response.preset = `, -map 0 ${ffmpegCommandInsert} -c copy -max_muxing_queue_size 9999`;
      response.container = `.${file.container}`;
      response.reQueueAfter = true;
      print_debug(debug,ffmpegCommandInsert);
      print_debug(debug,"☑File contain audio tracks which are unwanted or that require tagging.");
    } else {
      response.processFile = false;
      response.infoLog += "☑File doesn't contain audio tracks which are unwanted or that require tagging.\n";
      print_debug(debug,"☑File doesn't contain audio tracks which are unwanted or that require tagging.");
    }
  }
  
  print_debug(debug,'###### End Processing '+file.file)
  print_debug(debug,'')
  print_debug(debug,'')
  
  return response;
}
module.exports.details = details;
module.exports.plugin = plugin;
