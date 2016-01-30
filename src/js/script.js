var $ = require('jquery'),
    util = require('util'),
    rand = require('rand-paul'),
    electron = require('electron'),
    format = require('string-format'),
    key = require('./js/key.json'),
    wolfram = require('wolfram-alpha').createClient(key.api, {
        width: 348
    }),
    math = require("mathjs"),
    Shell = electron.shell,
    msg = new SpeechSynthesisUtterance(),
    clipboard = electron.clipboard,
    nativeImage = electron.nativeImage,
    ipcRenderer = electron.ipcRenderer,
    URL = "https://nimble-backend.herokuapp.com/input?i=%s";

var clipboardCopy = {
    link: function() {
        clipboard.writeText(window.links.wolfram);
    },
    text: function() {
        clipboard.writeText(window.json[1].subpods[0].text);
    },
    image: function() {
        // send with ipc to index.js, for now a WIP
        var image = nativeImage.createFromPath(webContents.downloadURL(window.json[1].subpods[0].image))
        clipboard.writeImage(image);
    }
}

// share buttons
var shareButton = {
    twitter: function() {
        var tweet = $("#input").val() + ":\n" + window.links.wolfram + " (via @nimbledotapp)";
        Shell.openExternal("https://twitter.com/intent/tweet?text=" + encodeURIComponent(tweet))
    }
}

// options
var preferences = {
    save: function() {
        var submenu = menuthing.items[menuthing.items.length - 1].submenu.items;

        window.options = {
            mathjs: submenu[0].checked,
            speech: submenu[1].checked
        };

        ipcRenderer.send("save_options", JSON.stringify(window.options));
    }
};

// most misc backdoor/electron/helper functions here
var backdoor = {
    resizeWindow: function(other) {
        var h = $("body").height();
        var w;

        // if not resizing width to fit an image (when parameter "other" isn't true) then just resize to body width
        // this is a temporary fix for oversized images until we figure something else out...
        // basically if you're not putting an image inside the output just put true as a parameter of backdoor.resizeWindow()x
        if (other === false || other === undefined) {
            w = $("#image-output").width() + 32;

            // if the width isn't oversized just roll with it
            if (w < 348) {
                w = 380; // default
            }
        } else if (other === true) {
            w = $("body").width();
        }


        ipcRenderer.send("resize", {
            height: h,
            width: w
        });
    },
    speak: function(text) {
        msg.voiceURI = 'native';
        msg.volume = 1; // 0 to 1
        msg.rate = 0.8; // 0.1 to 10
        msg.pitch = 1; //0 to 2
        msg.text = text;
        msg.lang = 'en-UK';

        window.log("Nimble just said \"" + text + "\" using the Speech Synthesizer.")
        speechSynthesis.cancel();
        speechSynthesis.speak(msg);
    }
}

// error forwarding
window.onerror = function(e) {
    ipcRenderer.send('node_console', {
        m: e
    })
}

// please use window.log instead of console.log, as it forwards it to the backend (node.js console)
// therefore bugs are easier to troubleshoot :)
window.log = function(log) {
    ipcRenderer.send('node_console', {
        m: log
    })
    console.log(log)
}

$(document).keypress(function(event) {
    if (event.which === 13 && $('#input').val() !== "") {
        query();
    } else if (event.which === 13 && $('#input').val() === "") {
        // save current placeholder
        var currentPlaceholder = $("#input").attr('placeholder');
        
        // ask user to use their words
        $("#input").attr('placeholder', "Error: Use your words.");

        // go back to placeholders
        window.setTimeout(function() {
            $('#input').attr('placeholder', currentPlaceholder);
        }, 3000);
    }
});

$(document).ready(function() {
    // set placeholder
    $.getJSON('js/suggestions.json', function(json) {
        var placeholder = rand.paul(json);
        $('#input').attr('placeholder', placeholder);
    });

    window.setInterval(function() {
        // new placeholder every 10 seconds
        $.getJSON('js/suggestions.json', function(json) {
            var placeholder = rand.paul(json);
            $('#input').attr('placeholder', placeholder);
        });
    }, 10000);

    // search button
    $("#input").keyup(function() {
        if (this.value == "") {
            $(".input button").css("opacity", "0.7");
        } else {
            $(".input button").css("opacity", "1");
        }
    });
});

// main shit here boys
var query = function() {
    var input = $('#input').val();
    var result;

    // in this try block, we check if things work
    try {
        if (input === "What is Nimble?" || input === "What is Nimble" || input === "what is Nimble?" || input === "what is nimble" || input === "what is Nimble" || input === "What is nimble" || input === "What is nimble?") {
            // if user asks what nimble is, tell them
            result = "Nimble is Wolfram|Alpha for your menubar. It is designed, coded, and crafted by <a href='#' onclick='Shell.openExternal(\"http://madebybright.com\")'>Bright</a>. We really hope you enjoy Nimble, and we tirelessly work on it as much as we can.<hr/>Nimble is built on Electron and Mathjs, as well as our blood, sweat, and keystrokes."
        } else if (window.options.mathjs === true) {
            result = math.eval(input);
        } else if (window.options.mathjs === false) {
            throw(new Error("Math.js has been disabled by the user."))
        }

        $(".interpret").css("display", "none");

        $(".output").html(result);
        backdoor.resizeWindow(true);

        // speak result if speech is on
        if(window.options.speech === true) {
            backdoor.speak($('.output').text())
        }
    } catch (e) {
        // if input isn't math throw error and use wolfram code
        window.log("Input is not math. Using Wolfram|Alpha. If you'd like, the error message given by MathJS is as follows:\n" + e);
        var encodedQuery = encodeURIComponent(input);
        var queryURL = util.format(URL, encodedQuery);

        window.links = {
            google: "https://www.google.ca/#q=" + encodedQuery,
            wolfram: "http://www.wolframalpha.com/input/?i=" + encodedQuery
        };

        // loader
        $(".interpret").css("display", "none");
        $(".output").html("<div class='loader-inner ball-scale-ripple' id='loader'><div><span></span></div></div>");
        backdoor.resizeWindow(true);

        wolfram.query(input, function(err, queryResult) {
            try {
                window.json = queryResult;
                result = window.json[1].subpods[0];

                var inputInterpretation = window.json[0].subpods[0].text;

                $(".output").html("<img alt=\"" + result.text + "\" id=\"image-output\" src=\"" + result.image + "\">");
                $("#queryInterpretation").text(inputInterpretation);

                $("#image-output").load(function() {
                    window.log("Image is ready, resizing window.");
                    $(".interpret").css("display", "block"); // only show once everything is ready
                    backdoor.resizeWindow();
                    
                    if(window.options.speech === true) {
                        backdoor.speak(result.text)
                    }
                });
            } catch (e) {
                window.log(e.toString())

                // try again if error
                retry(input)
            }

            if (err) {
                window.log(err.toString())

                // try again
                retry(input);
            }
        });

        window.log('Queried with: ' + queryURL);
    }
}

var retry = function(input) {
    var input = $('#input').val();
    var encodedInput = encodeURIComponent(input);
    var result;

    window.log("Error was thrown. Attempting to query again...");

    var errorMsg = format("<div class=\"sorry\">&#61721;</div><p class=\"err\">Sorry! I can't find the answer.<br/>Look it up on <a href='#' onclick='Shell.openExternal(\"{}\")'>Google</a> or <a href='#' onclick='Shell.openExternal(\"{}\")'>WolframAlpha</a>.</p>", window.links.google, window.links.wolfram);

    wolfram.query(input, function(err, queryResult) {
        try {
            window.json = queryResult;
            result = window.json[1].subpods[0];
            var inputInterpretation = window.json[0].subpods[0].text;

            $(".output").html("<img alt=\"" + result.text + "\" id=\"image-output\" src=\"" + result.image + "\">");
            $("#queryInterpretation").text(inputInterpretation);

            $("#image-output").load(function() {
                window.log("Image is ready, resizing window.");
                $(".interpret").css("display", "block"); // only show once everything is ready
                backdoor.resizeWindow();
                
                if(window.options.speech === true) {
                    backdoor.speak(result.text)
                }
            });
        } catch (e) {
            $(".interpret").css("display", "none");
            $(".output").html(errorMsg)
            backdoor.resizeWindow(true);
            throw e;
        }

        if (err) {
            $(".output").html(errorMsg)
            backdoor.resizeWindow(true);
            throw err;
        }
    });
}