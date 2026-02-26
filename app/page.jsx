"use client";

import React, { useState, useEffect, useRef } from "react";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";

// UI
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"
import { LoaderCircle, Github, Fan, Play, OctagonX, ChevronRight } from "lucide-react";

import { tts, loadModel, setProgressCallback } from "./kitten.js";

const TEXT = "Attention is all you need."

const MODELS = [
  { label: "Kitten TTS Nano 0.8 (15M int8)", url: "https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/main/kitten_tts_nano_v0_8.onnx" },
  { label: "Kitten TTS Nano 0.8 (15M fp32)", url: "https://huggingface.co/KittenML/kitten-tts-nano-0.8-fp32/resolve/main/kitten_tts_nano_v0_8.onnx" },
  { label: "Kitten TTS Micro 0.8 (40M)",     url: "https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/main/kitten_tts_micro_v0_8.onnx" },
  { label: "Kitten TTS Mini 0.8 (80M)",      url: "https://huggingface.co/KittenML/kitten-tts-mini-0.8/resolve/main/kitten_tts_mini_v0_8.onnx" },
]

const VOICES = {
  "Bella": "expr-voice-2-f",
  "Jasper": "expr-voice-2-m",
  "Luna": "expr-voice-3-f",
  "Bruno": "expr-voice-3-m",
  "Rosie": "expr-voice-4-f",
  "Hugo": "expr-voice-4-m",
  "Kiki": "expr-voice-5-f",
  "Leo": "expr-voice-5-m"  
}

const SPEED = {
  min: 0.5, max: 2.0, step: 0.1, default: 0.9
}

export default function Home() {
  // UI state
  const [device, setDevice] = useState(null);
  const [isLoading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isError, setError] = useState(false);
  const [status, setStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Inputs
  const [text, setText] = useState(TEXT);
  const [model, setModel] = useState(MODELS[0].url);
  const [voice, setVoice] = useState(Object.entries(VOICES)[0][1]);
  const [speed, setSpeed] = useState(SPEED.default);

  function handleModelChange(url) {
    setModel(url);
    setAudioUrl(null)
    setDevice(null);
    setLoading(true);
    setError(false);
    setStatus("Loading model..");
    setProgressCallback(setProgress)

    loadModel(url)
      .then((_dev) => {
        setDevice(_dev);
        setLoading(false);
        setProgress(null)
      })
      .catch((error) => {
        setError(true);
        setStatus(error.message);
        setProgress(null)
      });
  }

  function handleVoiceChange(_voice) {
    setVoice(_voice)
    setAudioUrl(null)
  }

  async function processText() {
    setLoading(true);
    setStatus("Generating speech...");
    setAudioUrl(null);

    try {
      const audioBlob = await tts(text, voice, speed);
      setAudioUrl(URL.createObjectURL(audioBlob));
      setStatus("Speech generated successfully!");
    } catch (error) {
      console.error("Error generating speech:", error);
      setStatus("Error generating speech");
    } finally {
      setLoading(false);
    }
  }

  // Load model on page load
  useEffect(() => {
    handleModelChange(model)
  }, []);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Autoplay: explicit .play() is more reliable than the autoPlay attribute on mobile
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play().catch(() => { /* blocked — controls let user play manually */ });
    }
  }, [audioUrl]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2 min-w-0">
              <CardTitle className="text-base sm:text-xl leading-snug">
                Clientside TTS with onnxruntime-web and Kitten TTS V0.8
              </CardTitle>
              <p className={cn("flex gap-1 items-center text-sm font-normal", device || isLoading || isError ? "visible" : "invisible")}>
                { isError
                  ? <OctagonX className="w-4 h-4 shrink-0" color="red"/>
                  : <Fan color="#000" className="w-4 h-4 shrink-0 animate-[spin_2.5s_linear_infinite] direction-reverse" />
                }
                { 
                  isLoading && status && progress ? `${status} ${(progress*100).toFixed(0)}%`:
                  isLoading && status ? status :
                  device ? "Running on " + device : ""
                }
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => window.open("https://github.com/geronimi73/next-voice", "_blank")}
            >
              <Github className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">View on GitHub</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                className="min-w-0"
                onChange={(e) => setText(e.target.value)}
                value={text}
                placeholder="Enter text to synthesize..."
                onKeyDown={(e) => { if (e.key === 'Enter') processText() }}
              />
              <Button onClick={processText} disabled={isLoading} className="whitespace-nowrap shrink-0">
                {isLoading
                  ? <LoaderCircle className="w-4 h-4 sm:mr-2 animate-spin" />
                  : <Play className="w-4 h-4 sm:mr-2" />
                }
                <span className="hidden sm:inline">Generate</span>
              </Button>
            </div>

            {/* Advanced */}
            <div>
              <button
                onClick={() => setAdvancedOpen(o => !o)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className={cn("w-4 h-4 transition-transform duration-300", advancedOpen && "rotate-90")} />
                Advanced
              </button>
              <div className={cn("grid transition-[grid-template-rows] duration-300 ease-in-out", advancedOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden">
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm w-12 shrink-0">Model</label>
                    <select
                      value={model} onChange={(e) => handleModelChange(e.target.value)}
                      disabled={isLoading}
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {MODELS.map(m => (
                        <option key={m.url} value={m.url}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm w-12 shrink-0">Voice</label>
                    <select
                      value={voice} onChange={(e) => handleVoiceChange(e.target.value)}
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      {Object.keys(VOICES).map(k => (
                        <option key={VOICES[k]} value={VOICES[k]}>{k}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm w-12 shrink-0">Speed</label>
                    <input type="range" min={SPEED.min} max={SPEED.max} step={SPEED.step} value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                    <span className="text-sm text-muted-foreground w-8 text-right">{speed.toFixed(1)}x</span>
                  </div>
                </div>
                </div>
              </div>
            </div>
            { audioUrl &&
              <audio ref={audioRef} key={audioUrl} src={audioUrl} controls className="w-full mt-2" />
            }
          </div>
        </CardContent>
      </Card>

      <Analytics />
    </div>
  );
}
