/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
function details() {
  return {
    id: 'Tdarr_Plugin_GR34_GrutSetDefaultAudioStream',
    Stage: 'Pre-processing',
    Name: 'Grut-Set default audio stream (Channel/Language)',
    Type: 'Streams',
    Operation: 'Default',
    Description: `This plugin will set an audio channel (2.0, 5.1, 7.1) to default and remove default from all other audio streams \n\n
                  If different language are available for the number of channel, choose the channel according to the most desired language.\n\n
                  `,
    Version: '0.1',
    Tags: 'pre-processing,audio only,default,configurable',
    Inputs: [
      {
        name: 'default_lang',
        tooltip: `Preferred default languages.
              \\nOptional.
              \\nExample:\\n
              fre,eng

              \\nNote:\\n
              All other language will be considered as undefined and will be used as fallback. In the above example, if no french track is found, try english, if none, take any matching the required number of channels \\n
              If no language is specified, the first track matching the required number of channels will be chosen`,
      },
      {
        name: "default_channels",
        tooltip: `Desired audio channel number.

              \\nExample:\\n

              2

              \\nExample:\\n

              6

              \\nExample:\\n

              8`,
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
  prefix=new Date().toISOString()+ " - " + "Tdarr_Plugin_GR34_GrutSetDefaultAudioStream - "
  if(debug)
    console.log(prefix+message)
}

function plugin(file, librarySettings, inputs) {
  var response = {
    processFile: false,
    preset: "",
    container: "." + file.container,
    handBrakeMode: false,
    FFmpegMode: true,
    infoLog: "",
  };

  let debug=false
  if (inputs && inputs.debug && inputs.debug.toLowerCase() === 'true')
    debug=true 

  let default_lang
  if (inputs && inputs.default_lang === '')
    default_lang="und"
  else default_lang=inputs.default_lang+",und"
  default_lang_array=default_lang.split(',')

  var shouldProcess = false;
  var defaultAudioStreams = 0;
  var matchingAudioStreams = 0;
  var defaultSet = false;
  var ffmpegCommandInsert = "";

  let audioLangIndex = {}
  let audioIdxLang = []

  let stream_language_array=[]
  for (let i=0;i<default_lang_array.length;i++){
    audioLangIndex[default_lang_array[i]]=i
    audioIdxLang[i]=-1
  }
  print_debug(debug,'###### Processing '+file.file)
  // Check if default audio stream matches user's channel selection
  for (var i = 0; i < file.ffProbeData.streams.length; i++) {
    try {
      print_debug(debug,"Stream "+i+" is "+ file.ffProbeData.streams[i].codec_type)
      if (file.ffProbeData.streams[i].codec_type.toLowerCase() === "audio"){
        print_debug(debug,"    Stream "+i+" - "+file.ffProbeData.streams[i].channels +" channels")
        // Identify audio language
        language="und"
        if(("tags" in file.ffProbeData.streams[i]) && ("language" in file.ffProbeData.streams[i].tags)){
            print_debug(debug,"    Stream "+i+" - Found language : "+  file.ffProbeData.streams[i].tags.language);
            language=file.ffProbeData.streams[i].tags.language
        }
        // if the language is not specified in inputs.lang_order, it's set to 'und'
        if (! default_lang_array.includes(language)) language='und'
        print_debug(debug,"    Stream "+i+" - Found final language : "+language)
        let langIdx=audioLangIndex[language]


        if (file.ffProbeData.streams[i].channels == inputs.default_channels) {
            if(audioIdxLang[langIdx]==-1) {
              audioIdxLang[langIdx]=i
              print_debug(debug,"    It matches channels and 1 of requested default language")
            }
            else print_debug(debug,"    It matches channels and 1 of requested default language but another stream with the same language and channels has already been chosen")
            matchingAudioStreams++;
        }
      }
    } catch (err) {
      print_debug(debug,"Caught an error")
      print_debug(debug,err)
    }
  }
  print_debug(debug,"AudioIdxLang")
  print_debug(debug,JSON.stringify(audioIdxLang))
  var candidateStream=-1
  for(var i=0;i<audioIdxLang.length;i++){
    if (audioIdxLang[i]>-1){
      print_debug(true,"Stream "+audioIdxLang[i]+" will be the default. Language is "+default_lang_array[i])
      response.infoLog += "Stream "+audioIdxLang[i]+" will be the default. Language is "+default_lang_array[i]+"\n"
      candidateStream=audioIdxLang[i]
      break;
    }
  }

  // Check if candidate is already the default stream
  if (candidateStream !== -1) {
    if (file.ffProbeData.streams[candidateStream].disposition.default === 1) {
      print_debug(true,"Stream "+audioIdxLang[i]+" is already the default stream. Don't do anything.")
      response.infoLog += "☑ Stream "+audioIdxLang[i]+" is already the default stream. Don't do anything.\n"
      shouldProcess=false;
    }
    else{
      shouldProcess=true;
      response.infoLog += "☒ Setting stream " + candidateStream + " to default. Remove default from all other audio streams \n";
      for (var i = 0; i < file.ffProbeData.streams.length; i++) {
        if (file.ffProbeData.streams[i].codec_type.toLowerCase() === "audio") {
          if (i == candidateStream) {
              ffmpegCommandInsert += `-disposition:${i} default `;
          } else {
            ffmpegCommandInsert += `-disposition:${i} 0 `;
          }
        }
      }
      // build command
      print_debug(debug,"ffmpedCommandInsert: "+ffmpegCommandInsert)
    }
  }
  else{
    print_debug(true,"No stream matching the requirements. Don't do anything.")
    response.infoLog += "☒ No stream matching the requirements. Don't do anything.\n"
    shouldProcess=false;
  }


  if (shouldProcess) {
    response.processFile = true;
    response.reQueueAfter = true;
    response.preset = `,-map 0 -c copy ${ffmpegCommandInsert}`;
  } 
  else {
    response.processFile = false;
  }
  print_debug(debug,'###### End Processing '+file.file)
  print_debug(debug,'')
  print_debug(debug,'')
  return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
