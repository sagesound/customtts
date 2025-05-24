
# Custom TTS Reader

TTS implementation for the OpenAI api format. It can probably be used for any OpenAI api compliant service but its made for remsky/Kokoro-FastAPI. 
Click 'Read Selected Text' in the context menu after highlighting text.

This addon is for Firefox!



## Installation

On Mozilla Addons:
https://addons.mozilla.org/en-US/firefox/addon/custom-tts-reader/
    
## Description

Do you have your own OpenAI-compatible Speech endpoint running and want to use it in Firefox?
This is a TTS implementation for the OpenAI API format. It can probably be used for any OpenAI api compliant service but its made for remsky/Kokoro-FastAPI.

Click 'Read Selected Text' in the context menu after highlighting text.

You can change the API URL, API key, speed and voice by clicking the extension icon in the toolbar.
The streaming mode is the prefered way of using the extension. Credits to [rampadc](https://github.com/rampadc/) for fixing the code.

Since you can host your own speech endpoint, privacy and accessibility are as good as the service you're running.

Personally I recommend using Kokoro FastAPI in a docker container:
https://github.com/remsky/Kokoro-FastAPI/


Note:
This is just a quick implementation since I couldn't find a similar extension where you could use your own API endpoint anywhere. I am not a developer. The code might be jank, but it works. Feel free to improve it... or not :)


## License

[MIT](https://choosealicense.com/licenses/mit/)

