# PRD: VSL Audio Recording & Auto-Edit Tool
## Ad Lifeline Feature Extension — ads.nexusholdings.io

---

## Overview

A new feature within the Ad Lifeline app that allows users to record VSL voiceovers, automatically transcribe and analyze the recordings against the original script, auto-trim filler words/pauses/bad takes, and present the user with a timeline editor to review, swap takes, fine-tune cuts, and export a final stitched MP3.

This eliminates the current bottleneck where VSL audio recording + manual chopping in CapCut takes 5-6 hours/day. Target is reducing that to 1-2 hours.

---

## Problem

- Abdullah currently records VSL audio manually in CapCut — multiple takes per section, then manually pieces together the best takes, cuts out ums/pauses/breathing, and stitches the final audio. This eats entire days.
- Voice actors are being trained but aren't consistent yet.
- ElevenLabs Arabic output still has dialect and cadence issues (sounds Lebanese/Egyptian instead of Saudi Najdi).
- There is no centralized tool within Ad Lifeline to manage the recording-to-export pipeline — it's all done outside the app in CapCut.

---

## Goals

1. Reduce VSL audio production time by at least 50%
2. Keep everything inside Ad Lifeline — no switching to CapCut or external audio editors
3. Make the process simple enough that a VA or voice actor can use it independently
4. Auto-detect and remove filler words, long pauses, and breathing gaps
5. AI selects the best take per script section — user just reviews and approves
6. Export a clean, stitched MP3 ready to send to video editors

---

## User Flow

### Step 1: Load Script
- User navigates to an existing ad card on the Ad Lifeline Kanban board (or creates a new one)
- User opens the "Audio Recording" tab on that card
- User pastes or imports the VSL script
- Script is automatically split into sections based on line breaks (each line = one section of the VSL, same structure used in the ElevenLabs voiceover tool Brian built)
- User can manually adjust section breaks if needed
- Each section is labeled (e.g., "Hook," "Lead," "Section 3," etc.) — user can rename

### Step 2: Record
- User sees the script displayed section by section (like a teleprompter view)
- The current section to record is highlighted
- User hits "Record" and reads the section — can do multiple takes back to back without stopping
- Between takes, user can just pause briefly or say "next take" (the AI will detect this as a take separator)
- User hits "Stop" when done with that section
- User moves to the next section and repeats
- **Alternative flow:** User can also record the entire script in one continuous session (all sections, all takes, just keep talking) and the AI will map everything to the correct script sections automatically

### Step 3: Transcription + Analysis (Automatic)
- Once recording is complete for a section (or the full script), the audio is sent to the backend
- **Whisper API** transcribes the audio with word-level timestamps in Arabic
- **Claude API** receives:
  - The original script (section by section)
  - The full transcript with timestamps
- Claude performs the following analysis:
  - **Section mapping:** Identifies which chunks of audio correspond to which script sections (critical for the "record everything in one go" flow)
  - **Take detection:** Within each section, identifies separate takes (based on pauses, repeated content, or explicit markers like "next take")
  - **Best take selection:** For each section, ranks the takes by:
    - Completeness (did they say all the words in the script?)
    - Clarity (minimal stumbling, filler words, restarts)
    - Flow (natural pacing, no awkward gaps mid-sentence)
  - **Filler detection:** Flags all ums, ahs, filler words, and their exact timestamps
  - **Pause detection:** Flags breathing gaps and dead air longer than a configurable threshold (default: 0.8 seconds)
  - **Cut recommendations:** Returns a JSON object with:
    - Best take per section (with start/end timestamps)
    - List of filler words to remove (with start/end timestamps)
    - List of pauses to remove (with start/end timestamps)
    - Alternative takes per section ranked in order

### Step 4: Timeline Editor (User Review)
- User sees a visual waveform timeline (using wavesurfer.js or similar)
- The AI's recommended cuts are already applied — the timeline shows the "best version" by default
- Filler words and pauses are visually marked (different color overlays on the waveform)
- For each section, user can:
  - **Play** the selected take
  - **Swap takes** — click to hear alternative takes for that section and swap in a different one
  - **Fine-tune cuts** — drag the cut points left or right if the AI trimmed too aggressively or not enough
  - **Split** — manually split a clip at any point
  - **Delete** — remove a segment manually
  - **Undo/redo** — full history
- The script text is displayed alongside the timeline, section by section, so the user can see what should be said vs what was said
- A "Play All" button lets the user hear the full stitched result from start to finish before exporting

### Step 5: Export
- User hits "Export"
- Backend uses **FFmpeg** to:
  - Cut the raw audio at all the finalized timestamps
  - Stitch the selected takes together in order
  - Normalize audio levels across sections (so volume is consistent)
  - Apply a subtle noise gate if needed (remove low-level background noise between words)
  - Export as MP3 (configurable bitrate, default 192kbps)
- The exported MP3 is attached to the ad card on the Kanban board automatically
- User can download it or share the link directly with editors

---

## Technical Architecture

### Frontend
- **Framework:** React (existing Ad Lifeline frontend stack)
- **Waveform/timeline component:** wavesurfer.js (open source, supports regions, markers, zoom, and interactive editing)
- **Audio recording:** Browser MediaRecorder API (records in WAV for maximum quality before processing)
- **State management:** Whatever the existing Ad Lifeline app uses — the audio tool state (sections, takes, cuts) should persist per ad card

### Backend
- **Language:** Python (FastAPI or Flask, whichever the existing backend uses)
- **Hosted on:** Existing VPS (Hostinger) or Vercel serverless functions depending on current architecture
- **Audio file storage:** Supabase Storage (or whatever the current Ad Lifeline app uses for file storage) — store raw recordings and exported MP3s per ad card

### External APIs
- **Whisper (OpenAI API):**
  - Endpoint: `/v1/audio/transcriptions`
  - Model: `whisper-1`
  - Parameters: `response_format: verbose_json`, `timestamp_granularities: ["word"]`, `language: "ar"`
  - Returns: Full transcript with word-level timestamps
  - Cost: ~$0.006 per minute of audio
- **Claude API (Anthropic):**
  - Model: Sonnet (sufficient for analysis — doesn't need Opus since this isn't creative writing, just pattern matching and comparison)
  - Input: Original script sections + Whisper transcript with timestamps
  - Output: Structured JSON with section mappings, take rankings, filler/pause timestamps, cut recommendations
  - Single API call per recording session

### Audio Processing
- **FFmpeg** (installed on server):
  - Cutting: `ffmpeg -i input.wav -ss [start] -to [end] -c copy output_segment.wav`
  - Stitching: concat demuxer to join all approved segments
  - Normalization: `loudnorm` filter for consistent volume
  - Noise gate: `afftdn` filter (optional, user-toggleable)
  - Export: `-codec:a libmp3lame -b:a 192k`

---

## Data Model

### AudioProject (per ad card)
```
{
  id: string,
  ad_card_id: string,              // links to existing Kanban card
  script_sections: [
    {
      id: string,
      label: string,               // "Hook", "Lead", "Section 3", etc.
      script_text: string,          // the original script text for this section
      order: number
    }
  ],
  raw_recordings: [
    {
      id: string,
      file_url: string,            // stored audio file
      duration_seconds: number,
      created_at: timestamp
    }
  ],
  transcript: {
    full_text: string,
    words: [
      {
        word: string,
        start: float,              // seconds
        end: float                 // seconds
      }
    ]
  },
  analysis: {
    section_mappings: [
      {
        section_id: string,
        takes: [
          {
            take_number: number,
            start: float,
            end: float,
            rank: number,           // 1 = best
            completeness_score: float,
            is_selected: boolean    // user's final choice
          }
        ]
      }
    ],
    filler_words: [
      { start: float, end: float, word: string, removed: boolean }
    ],
    pauses: [
      { start: float, end: float, duration: float, removed: boolean }
    ]
  },
  export: {
    file_url: string,
    exported_at: timestamp,
    settings: {
      bitrate: string,
      normalize: boolean,
      noise_gate: boolean
    }
  }
}
```

---

## Claude API Prompt Structure

When sending the transcript to Claude for analysis, the prompt should include:

```
You are an audio editing assistant analyzing a VSL voiceover recording in Saudi Arabic.

Here is the original script broken into sections:
[sections with labels and text]

Here is the full transcript with word-level timestamps from the recording:
[Whisper output]

Your job:
1. Map each chunk of the transcript to the corresponding script section. The speaker may have recorded multiple takes of each section back to back.
2. Within each section, identify separate takes (indicated by repeated content, long pauses between attempts, or the speaker saying "again" / "next" in Arabic or English).
3. Rank each take per section by: completeness (all words from script present), clarity (minimal stumbling), and natural flow.
4. Flag all filler words (um, ah, uh, يعني, etc.) with their exact timestamps.
5. Flag all pauses longer than 0.8 seconds with their timestamps.

Return your analysis as a JSON object with this exact structure:
[schema]
```

---

## UI Sections Within Ad Lifeline

This feature lives as a new tab on each ad card in the Kanban board:

**Ad Card → Tabs:**
- Brief (existing)
- Notes (existing)
- Metrics (existing)
- Thread (existing)
- AI Analysis (existing)
- **Audio Recording (NEW)**

Within the Audio Recording tab:
1. **Script Panel** (left side) — paste/import script, shows sections
2. **Recording Panel** (center) — record button, teleprompter view of current section
3. **Timeline Panel** (bottom) — waveform editor with all takes, cuts, and sections after processing
4. **Export Panel** (right side) — export settings and download

---

## Edge Cases to Handle

- **User records everything in one take without clear section breaks:** Claude should still be able to map content to script sections based on text matching, even without pauses between sections
- **User speaks off-script or ad-libs:** Flag these segments as "unmatched" and let the user manually assign them to a section or discard
- **Very short sections (1-2 words):** Whisper may struggle with timestamp accuracy on very short phrases — add a manual trim option for these
- **Background noise:** Include an optional noise reduction toggle using FFmpeg's `afftdn` filter before transcription to improve Whisper accuracy
- **Large audio files:** If a user records 30+ minutes in one go, chunk the Whisper API call appropriately (Whisper has a 25MB file size limit — split and rejoin if needed)
- **Arabic dialect words not in Whisper's vocabulary:** Some Saudi colloquial words may be mistranscribed — the section mapping should rely on fuzzy text matching, not exact word matching

---

## Out of Scope (for now)

- Video editing / B-roll integration (editors handle this separately)
- ElevenLabs voice cloning integration (separate tool Brian built)
- Multi-user simultaneous recording
- Auto-publishing audio to editors (manual download + send for now)
- Music/sound effects layering

---

## Success Metrics

- Time to produce a final VSL audio file reduced from 5-6 hours to under 2 hours
- User can record 5 VSL scripts per day (Abdullah's target) without burning the full day
- AI take selection accuracy > 80% (user agrees with the AI's pick at least 4 out of 5 times)
- Zero manual CapCut usage for audio chopping after this feature is live

---

## Priority

HIGH — This is the #2 bottleneck identified in the Storm advisory call (after big idea generation). Directly blocks ad production volume scaling from current output to the 60-120 ads/month target.
