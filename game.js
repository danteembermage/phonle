// --- 1. DOM Elements ---
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const gameContainer = document.getElementById('game-container');
const phonemeKeyboard = document.getElementById('phoneme-keyboard');
const gridElement = document.getElementById('grid');
const guessInputElement = document.getElementById('guess-input');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const messageSubtext = document.getElementById('message-subtext');

// --- 2. Game State Variables ---
let dictionary = {};
let frequencySet = new Set();
let wordlist = [];
let allPhonemesSorted = [];
let phonemeStatus = {}; // { "AA": "default", "B": "correct", ... }

let targetWord = "";
let targetPhonemes = [];
let guesses = []; // Array of guess objects
let currentGuess = "";
let currentRow = 0;
let gameState = "loading"; // loading, playing, revealing, over
const MAX_GUESSES = 6;
const LINES_PER_FRAME = 2000;

let gridTiles = []; // 2D array of grid DOM elements

// --- 3. Game Initialization ---

window.onload = () => {
    // Create the grid tiles
    for (let i = 0; i < MAX_GUESSES; i++) {
        let row = [];
        for (let j = 0; j < 5; j++) {
            let tile = document.createElement('div');
            tile.className = 'tile';
            gridElement.appendChild(tile);
            row.push(tile);
        }
        gridTiles.push(row);
    }
    
    // Start listening for input
    window.addEventListener('keydown', handleKeydown);
    
    // Start the async loading process
    loadGameData();
};

async function loadGameData() {
    // 1. Load frequency list (small, so load all at once)
    const freqResponse = await fetch('frequency.txt');
    const freqText = await freqResponse.text();
    freqText.split('\n').forEach(word => {
        if (word) frequencySet.add(word.toUpperCase());
    });
    console.log(`Frequency list loaded: ${frequencySet.size} words`);

    // 2. Load dictionary (large, process in chunks)
    const dictResponse = await fetch('dictionary.txt');
    const dictText = await dictResponse.text();
    const lines = dictText.split('\n');
    const totalLines = lines.length;
    let phonemeSet = new Set();

    function processDictionaryChunk(index) {
        let endIndex = Math.min(index + LINES_PER_FRAME, totalLines);
        
        for (let i = index; i < endIndex; i++) {
            let line = lines[i];
            if (line && !line.startsWith(';;;')) {
                const parts = line.split('  ');
                if (parts.length === 2) {
                    const word = parts[0];
                    const phonemesStr = parts[1].replace(/\d/g, ''); // Remove stress numbers
                    const phonemes = phonemesStr.split(' ').filter(p => p);
                    
                    dictionary[word] = phonemes;
                    phonemes.forEach(p => phonemeSet.add(p));

                    if (phonemes.length === 5 && frequencySet.has(word)) {
                        wordlist.push(word);
                    }
                }
            }
        }

        // Update progress bar
        loadingBar.style.width = `${(endIndex / totalLines) * 100}%`;

        // Schedule next chunk or finish
        if (endIndex < totalLines) {
            setTimeout(() => processDictionaryChunk(endIndex), 0);
        } else {
            finishLoading(phonemeSet);
        }
    }
    
    // Start processing the first chunk
    processDictionaryChunk(0);
}

function finishLoading(phonemeSet) {
    allPhonemesSorted = Array.from(phonemeSet).sort();
    console.log(`Dictionary loaded. ${wordlist.length} common 5-phoneme words found.`);
    
    // Hide loading screen, show game
    loadingScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    
    startGame();
}

function startGame() {
    // Reset game state
    guesses = [];
    currentGuess = "";
    currentRow = 0;
    
    // Pick new word
    targetWord = wordlist[Math.floor(Math.random() * wordlist.length)];
    targetPhonemes = dictionary[targetWord];
    console.log("New game started. Target:", targetWord, `/${targetPhonemes.join(' ')}/`);

    // Reset phoneme status
    phonemeStatus = {};
    allPhonemesSorted.forEach(p => {
        phonemeStatus[p] = "default";
    });

    // Reset UI
    clearGrid();
    updatePhonemeKeyboard();
    hideMessageBox();
    gameState = "playing";
}

// --- 4. Game Loop & Input ---

function handleKeydown(e) {
    if (gameState === "over" && e.key === "Enter") {
        startGame();
        return;
    }
    
    if (gameState !== "playing") return;

    if (e.key === "Enter") {
        submitGuess();
    } else if (e.key === "Backspace") {
        currentGuess = currentGuess.slice(0, -1);
    } else if (e.key.match(/^[a-zA-Z]$/)) {
        currentGuess += e.key.toUpperCase();
    }
    
    updateGuessInput();
}

function updateGuessInput() {
    guessInputElement.textContent = currentGuess;
    
    // Apply shake if invalid, then remove
    if (guessInputElement.classList.contains('shake')) {
        guessInputElement.classList.remove('shake');
    }
}

function submitGuess() {
    if (currentGuess.length === 0) return;

    const guessPhonemes = dictionary[currentGuess];
    
    // Validation
    if (!guessPhonemes) {
        showError("Word not in dictionary");
        return;
    }
    if (guessPhonemes.length !== 5) {
        showError(`Guess must have 5 sounds (not ${guessPhonemes.length})`);
        return;
    }
    
    // --- Core Logic ---
    gameState = "revealing";
    let feedback = ["absent", "absent", "absent", "absent", "absent"];
    let tempTarget = [...targetPhonemes];

    // 1st pass: Check for 'correct' (green)
    for (let i = 0; i < 5; i++) {
        if (guessPhonemes[i] === tempTarget[i]) {
            feedback[i] = "correct";
            tempTarget[i] = null; // Mark as used
        }
    }
    
    // 2nd pass: Check for 'present' (yellow)
    for (let i = 0; i < 5; i++) {
        if (feedback[i] !== "correct") {
            const index = tempTarget.indexOf(guessPhonemes[i]);
            if (index !== -1) {
                feedback[i] = "present";
                tempTarget[index] = null; // Mark as used
            }
        }
    }
    
    // Store guess and update phoneme status
    guesses.push({ word: currentGuess, phonemes: guessPhonemes, feedback });
    
    for (let i = 0; i < 5; i++) {
        const p = guessPhonemes[i];
        const currentStatus = phonemeStatus[p];
        if (feedback[i] === "correct") {
            phonemeStatus[p] = "correct";
        } else if (feedback[i] === "present" && currentStatus !== "correct") {
            phonemeStatus[p] = "present";
        } else if (feedback[i] === "absent" && currentStatus === "default") {
            phonemeStatus[p] = "absent";
        }
    }

    // Clear input
    currentGuess = "";
    updateGuessInput();
    
    // Start animations
    animateGuess();
}

// --- 5. UI & Animation Functions ---

function animateGuess() {
    const row = gridTiles[currentRow];
    const guess = guesses[currentRow];
    const PRE_REVEAL_STAGGER = 70; // ms
    const PRE_REVEAL_DURATION = 210; // ms
    const REVEAL_STAGGER = 200; // ms
    const REVEAL_DURATION = 600; // ms

    // 1. Pre-reveal spin
    row.forEach((tile, index) => {
        setTimeout(() => {
          tile.classList.add('flip-pre');
        }, index * PRE_REVEAL_STAGGER);

        // Remove class after animation
        setTimeout(() => {
            tile.classList.remove('flip-pre');
        }, index * PRE_REVEAL_STAGGER + PRE_REVEAL_DURATION);
    });
    
    // 2. Main reveal (starts after pre-reveal is staggered)
    const totalPreRevealTime = (4 * PRE_REVEAL_STAGGER) + PRE_REVEAL_DURATION;
    
    row.forEach((tile, index) => {
        setTimeout(() => {
            // Set text and color halfway through the flip
            setTimeout(() => {
                tile.textContent = guess.phonemes[index];
                tile.classList.add(guess.feedback[index]);
            }, REVEAL_DURATION / 0.9);
            
             Start the flip
            tile.classList.add('flip-reveal');
            //tile.classList.add('flip-reveal');
        }, totalPreRevealTime + index * REVEAL_STAGGER);
    });
    
    // 3. After last animation, check win/loss
    const totalRevealTime = totalPreRevealTime + (4 * REVEAL_STAGGER) + REVEAL_DURATION;
    setTimeout(() => {
        checkWinLoss();
    }, totalRevealTime);
}

function checkWinLoss() {
    const lastGuess = guesses[guesses.length - 1];
    const won = lastGuess.feedback.every(f => f === "correct");

    if (won) {
        showMessageBox("You won!", "Press Enter to play again");
        gameState = "over";
    } else if (guesses.length === MAX_GUESSES) {
        const revealText = `The word was: ${targetWord}\n/${targetPhonemes.join(' ')}/`;
        showMessageBox("Out of guesses!", revealText + "\nPress Enter to play again");
        gameState = "over";
    } else {
        // Continue playing
        currentRow++;
        gameState = "playing";
        updatePhonemeKeyboard();
    }
}

function clearGrid() {
    for (let row of gridTiles) {
        for (let tile of row) {
            tile.textContent = "";
            tile.className = "tile";
        }
    }
}

function updatePhonemeKeyboard() {
    phonemeKeyboard.innerHTML = ""; // Clear old keys
    allPhonemesSorted.forEach(p => {
        const key = document.createElement('div');
        key.className = 'key';
        key.textContent = p;
        key.classList.add(phonemeStatus[p] || 'default');
        phonemeKeyboard.appendChild(key);
    });
}

function showError(msg) {
    showMessageBox(msg, "", 1500); // Show for 1.5 seconds
    guessInputElement.classList.add('shake');
    currentGuess = ""; // Clear bad guess
}

function showMessageBox(text, subtext, timer = 0) {
    messageText.textContent = text;
    messageSubtext.innerHTML = subtext.replace('\n', '<br>'); // Handle newlines
    messageBox.classList.remove('hidden');

    if (timer > 0) {
        setTimeout(hideMessageBox, timer);
    }
}

function hideMessageBox() {
    messageBox.classList.add('hidden');
}
