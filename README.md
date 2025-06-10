# 🐍 Python Code Editor for Self-Paced Learning

This is a **browser-based Python code editor** built using **CodeMirror** and **Pyodide**, designed to let students run Python code safely inside the browser with no installations required.

It's used in a self-paced **Intro to Coding course** hosted on [LearnWorlds](https://www.learnworlds.com), embedded via iframe or script. The editor is fully front-end, hosted on GitHub Pages.

---

## 🔧 Features

- ✅ Run Python in the browser (via [Pyodide](https://pyodide.org/))
- ✅ Syntax-highlighted code editor (via [CodeMirror](https://codemirror.net/))
- ✅ Output capture using Python's `StringIO`
- ✅ Auto-save code to `localStorage`
- ✅ Execution timeouts to catch infinite loops
- ✅ Error and warning messages for student feedback
- ✅ Modular exercise files (easy to add new lessons)

---

## 📁 File Structure

```plaintext
/
├── assets
│   └── exercise-template    # Template for an exercise
├── index.html               # Landing page linking to all exercises
├── main.js                  # Core JS logic (editor, saving, execution)
├── pyodideWorker.js         # Web Worker that runs Python safely
├── style.css                # Custom theme, buttons, output box
├── exercises/
│   └── module-1/
│       └── 1-hello-world.html     
│   └── module-2/
│       └── 2-favorite-fruit.html # (Add more here...)
└── README.md                # You're reading it
```

---

## 📦 Dependencies

All dependencies are loaded via CDN:

| Tool        | Purpose                         |
|-------------|----------------------------------|
| [CodeMirror](https://codemirror.net/) | In-browser code editor |
| [Pyodide](https://pyodide.org/)     | Python runtime in WebAssembly |
| Web Workers | Run code in background without freezing UI |

---

## ⚙️ How It Works

### 🔸 `main.js`
- Sets up CodeMirror for editing
- Loads or saves code to `localStorage` per exercise
- Sends code to `pyodideWorker.js` for execution
- Monitors for timeouts and errors
- Displays output or warning messages

### 🔸 `pyodideWorker.js`
- Loads Pyodide in a Web Worker
- Runs the user’s Python code using `exec()`
- Captures stdout with `StringIO`
- Returns results (or errors) back to `main.js`

### 🔸 `style.css`
- Defines layout, branding, and styling for:
  - Editor container
  - Output box
  - Run/Reset buttons
  - Warning messages

---

## 🧠 Adding New Exercises

To create a new exercise:

1. **Copy** the template from `assets/exercise-template.html`
2. **Update the title and instructions**
3. Define your starter code:
   ```html
   <script>
     const initial_code = `# Example: print("Hello")`;
   </script>
   ```
4. **Add the new file** to `index.html` under the appropriate module link
5. **UPDATE THE SCRIPT**: When pushing to Github pages, github pages will use the file path related to the domain of your deployed page (ex: `learnworlds-ide/main.js`)

Each exercise runs independently using the shared `main.js` and `pyodideWorker.js`.

---

## 🛡 Security and Stability

- All code runs in a **Web Worker sandbox** with no access to the filesystem, network, or host system.
- Execution is **limited to 3–10 seconds** to prevent infinite loops or browser crashes.
- Output is shown using `innerText` (not `innerHTML`) to prevent XSS.

---

## 🚀 Deployment

- Built for GitHub Pages (or any static site host)
- No server required
- Embed using an iframe or direct link from your LMS (e.g., LearnWorlds)

---

## 👩‍💻 Contributing

If you're adding new features, here’s how the pieces fit together:

| Task                        | File(s) to Edit             |
|----------------------------|-----------------------------|
| Add new exercise           | `exercises/...`, `index.html` |
| Change default timeout     | `main.js` → `EXECUTION_TIMEOUT` |
| Update editor theme        | `style.css`             |
| Add new language support   | Extend `pyodideWorker.js` (experimental) |
| Fix bugs in execution flow | `main.js`, `pyodideWorker.js` |

---

## ❓FAQ

**Q: Can students break the site with bad code?**  
No — infinite loops are auto-stopped, and each code run is sandboxed.

**Q: Is this secure for embedding in LearnWorlds?**  
Yes. Since everything runs in the browser, it doesn’t expose your server or database since we are using one.

**Q: What if I want to reset Pyodide between runs?**  
You can terminate and recreate the worker in `main.js`.

**Q: Are any api keys exposed?**
No. No 3rd party api is used.

---

## 📬 Maintainer

Created by roger@codeplatoon.org

