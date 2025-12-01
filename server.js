const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Playlist paths
const BP_LIST_PATH = path.join(__dirname, "random.bplist");
const TMP_JSON_PATH = path.join(__dirname, "random.tmp.json");

// Flags
let isGenerating = false;

app.use(express.static("public"));

// Utility sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ==============================
//    BEATSAVER RANDOM SYSTEM
// ==============================

// Fetch one random map from the "latest" feed
async function fetchRandomBeatSaverMap() {
  // Pick a random page from the first 10 pages of latest maps
  const page = Math.floor(Math.random() * 10);

  const url = `https://api.beatsaver.com/maps/latest/${page}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error("BeatSaver failed:", res.status);
    return null;
  }

  const data = await res.json();
  if (!data.docs || data.docs.length === 0) return null;

  // Pick a random map from this page
  const map = data.docs[Math.floor(Math.random() * data.docs.length)];

  return {
    hash: map.versions[0].hash.toUpperCase(),
    songName: map.metadata.songName,
    difficulties: []
  };
}


// ==============================
//   PLAYLIST GENERATION
// ==============================

// Load previously stored songs
async function loadTempSongs() {
  if (fs.existsSync(TMP_JSON_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(TMP_JSON_PATH));
    } catch {
      return [];
    }
  }
  return [];
}

// Generate valid bplist JSON
function generateBplist(songs) {
  return JSON.stringify({
    playlistTitle: "Random BeatSaver Auto Playlist",
    playlistAuthor: "EvanBlokEnder",
    customData: {
      image: ICON_BASE64, // No duplicates
      syncURL: "https://beat-saber-playlist-auto-thing-by.onrender.com/random.bplist"
    },
    songs
  }, null, 2);
}

// Playlist icon (ONLY STORED ONCE)
const ICON_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAA..." // trimmed if needed


// Add a random map & regenerate playlist
async function updateBplist() {
  if (isGenerating) return;
  isGenerating = true;

  try {
    const currentSongs = await loadTempSongs();

    const randomMap = await fetchRandomBeatSaverMap();
    if (randomMap) {
      console.log("Added map:", randomMap.songName, randomMap.hash);
      currentSongs.push(randomMap);
    } else {
      console.log("Failed to fetch random map");
    }

    // Write updated files
    fs.writeFileSync(TMP_JSON_PATH, JSON.stringify(currentSongs, null, 2));
    fs.writeFileSync(BP_LIST_PATH, generateBplist(currentSongs));

    console.log(`✔ Playlist now contains ${currentSongs.length} maps.`);
  } catch (e) {
    console.error("❌ Error:", e);
  } finally {
    isGenerating = false;
  }
}


// ==============================
//   EXPRESS ROUTES
// ==============================

app.get("/status", (req, res) => {
  res.json({ generating: isGenerating });
});

app.get("/generate", async (req, res) => {
  if (isGenerating) return res.status(202).send("Already generating...");
  res.send("Adding a new random map...");
  updateBplist();
});

app.get("/random.bplist", (req, res) => {
  if (isGenerating) {
    return res.status(202).send("Playlist is still generating...");
  }

  if (fs.existsSync(BP_LIST_PATH)) {
    res.download(BP_LIST_PATH, "random.bplist");
  } else {
    res.status(404).send("Playlist not found.");
  }
});


// ==============================
//   START SERVER
// ==============================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Run immediately on first deploy
  updateBplist();

  // Run every hour
  setInterval(updateBplist, 60 * 60 * 1000);
});
