/**
 * Example usage of the FileManager module
 * This shows how to refactor existing code to use the new FileManager
 */

import { FileManager, DEFAULT_SAMPLE_FILES } from "./FileManager";
import { MultiMidiManager } from "../../MultiMidiManager";

// Example 1: Basic setup and sample file loading
export async function basicUsageExample() {
  // Create MIDI manager and file manager
  const midiManager = new MultiMidiManager();
  const fileManager = new FileManager(midiManager);

  // Load default sample files
  await fileManager.loadSampleFiles();

  // Or load custom sample files
  const customFiles = [
    { path: "./src/sample_midi/jazz.mid", displayName: "Jazz Piece" },
    { path: "./src/sample_midi/cut_liszt.mid", displayName: "Liszt Excerpt" },
  ];
  await fileManager.loadSampleFiles(customFiles);

  console.log(`Loaded ${fileManager.getFileCount()} files`);
}

// Example 2: File upload handling
export function fileUploadExample() {
  const midiManager = new MultiMidiManager();
  const fileManager = new FileManager(midiManager);

  // Create file input for user file selection
  const fileInput = fileManager.createFileInput({
    multiple: true,
    onFileSelect: async (files: File[]) => {
      try {
        const fileIds = await fileManager.loadMultipleFiles(files);
        console.log(`Successfully loaded ${fileIds.length} files`);
      } catch (error) {
        console.error("Failed to load files:", error);
      }
    },
  });

  // Add to DOM
  document.body.appendChild(fileInput);
}

// Example 3: File validation before loading
export async function fileValidationExample() {
  const midiManager = new MultiMidiManager();
  const fileManager = new FileManager(midiManager);

  // Validate file before loading
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".mid,.midi";

  fileInput.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const validation = await fileManager.validateFile(file);

      if (validation.isValid) {
        const fileId = await fileManager.loadFile(file);
        console.log(`File loaded with ID: ${fileId}`);
      } else {
        console.error("File validation failed:", validation.error);
      }
    }
  });
}

// Example 4: File management operations
export function fileManagementExample() {
  const midiManager = new MultiMidiManager();
  const fileManager = new FileManager(midiManager);

  // Get all files
  const allFiles = fileManager.getAllFiles();
  console.log("All files:", allFiles);

  // Get visible files only
  const visibleFiles = fileManager.getVisibleFiles();
  console.log("Visible files:", visibleFiles);

  // Toggle file visibility
  if (allFiles.length > 0) {
    const firstFile = allFiles[0];
    fileManager.toggleFileVisibility(firstFile.id);
    console.log(`Toggled visibility for ${firstFile.displayName}`);
  }

  // Update file properties
  if (allFiles.length > 0) {
    const firstFile = allFiles[0];
    fileManager.updateFileDisplayName(firstFile.id, "New Name");
    fileManager.updateFileColor(firstFile.id, 0xff0000); // Red color
  }

  // Remove a file
  if (allFiles.length > 0) {
    const lastFile = allFiles[allFiles.length - 1];
    fileManager.removeFile(lastFile.id);
    console.log(`Removed file: ${lastFile.displayName}`);
  }
}

// Example 5: Drag and drop handling
export function dragDropExample() {
  const midiManager = new MultiMidiManager();
  const fileManager = new FileManager(midiManager);

  // Set up drag and drop area
  const dropArea = document.createElement("div");
  dropArea.style.cssText = `
    width: 300px;
    height: 200px;
    border: 2px dashed #ccc;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 20px;
    background: #f9f9f9;
  `;
  dropArea.textContent = "Drop MIDI files here";

  // Prevent default drag behaviors
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  // Handle visual feedback
  ["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, () => {
      dropArea.style.borderColor = "#007bff";
      dropArea.style.background = "#e3f2fd";
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, () => {
      dropArea.style.borderColor = "#ccc";
      dropArea.style.background = "#f9f9f9";
    });
  });

  // Handle file drop
  dropArea.addEventListener("drop", async (e) => {
    try {
      const fileIds = await fileManager.handleFileDrop(e as DragEvent);
      console.log(
        `Successfully loaded ${fileIds.length} files via drag and drop`
      );
    } catch (error) {
      console.error("Failed to handle file drop:", error);
    }
  });

  document.body.appendChild(dropArea);
}

// Example 6: Refactored version of the original loadSampleFiles method
export class RefactoredMultiMidiDemo {
  private fileManager: FileManager;
  private midiManager: MultiMidiManager;
  private initialFiles: Array<{ path: string; displayName?: string }> = [];

  constructor(
    container: HTMLElement,
    initialFiles: Array<{ path: string; displayName?: string }> = []
  ) {
    this.midiManager = new MultiMidiManager();
    this.fileManager = new FileManager(this.midiManager);
    this.initialFiles = initialFiles;
  }

  async initialize(): Promise<void> {
    // Load user-supplied files if provided, otherwise fallback to default sample files
    if (this.initialFiles && this.initialFiles.length > 0) {
      await this.fileManager.loadSampleFiles(this.initialFiles);
    } else {
      await this.fileManager.loadSampleFiles();
    }

    // Set up state change listener
    this.midiManager.setOnStateChange((state) => {
      this.updateUI();
    });

    this.updateUI();
  }

  private updateUI(): void {
    // Update the UI based on the current state
    const files = this.fileManager.getAllFiles();
    console.log(`UI updated with ${files.length} files`);

    // This is where you'd update your actual UI elements
    // For example: this.updateSidebar(), this.updateVisualization(), etc.
  }

  // Example of how to handle file uploads in the refactored version
  private setupFileUpload(): void {
    const fileInput = this.fileManager.createFileInput({
      multiple: true,
      onFileSelect: async (files: File[]) => {
        try {
          const fileIds = await this.fileManager.loadMultipleFiles(files);
          console.log(`Successfully loaded ${fileIds.length} files`);
          // UI will be updated automatically via the state change listener
        } catch (error) {
          console.error("Failed to load files:", error);
        }
      },
    });

    // Add to your UI container
    // this.container.appendChild(fileInput);
  }
}

// Example 7: Utility functions usage
export function utilityFunctionsExample() {
  const { FileUtils } = require("./FileManager");

  // Check if file is valid MIDI
  const file = new File([""], "test.mid", { type: "audio/midi" });
  console.log("Is valid MIDI:", FileUtils.isValidMidiFile(file));

  // Format file size
  console.log("File size:", FileUtils.formatFileSize(1024 * 1024)); // "1 MB"

  // Get file name without extension
  console.log("Base name:", FileUtils.getFileNameWithoutExtension("song.mid")); // "song"

  // Generate unique file ID
  console.log("Unique ID:", FileUtils.generateFileId("song.mid"));
}
