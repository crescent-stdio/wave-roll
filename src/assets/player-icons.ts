/**
 * SVG Icons for player controls
 */

export const PLAYER_ICONS = {
  play: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M4 2.5v11l9-5.5z"/>
  </svg>`,

  pause: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M4 2h3v12H4zM9 2h3v12H9z"/>
  </svg>`,

  restart: `<svg width="16" height="16" viewBox="0 0 16 16" stroke-width="1.5" fill="currentColor" style="pointer-events: none;">
    <path d="M7.5 4.5 2 8l5.5 3.5V4.5z"/>
    <path d="M14 4.5 8.5 8l5.5 3.5V4.5z"/>
  </svg>`,

  repeat: `<svg width="16" height="16" viewBox="0 0 16 16" stroke-width="1.5" fill="currentColor" style="pointer-events: none;">
    <path d="M11 5.466V4H5a4 4 0 0 0-3.584 5.777.5.5 0 1 1-.896.446A5 5 0 0 1 5 3h6V1.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384l-2.36 1.966a.25.25 0 0 1-.41-.192Zm3.81.086a.5.5 0 0 1 .67.225A5 5 0 0 1 11 13H5v1.466a.25.25 0 0 1-.41.192l-2.36-1.966a.25.25 0 0 1 0-.384l2.36-1.966a.25.25 0 0 1 .41.192V12h6a4 4 0 0 0 3.585-5.777.5.5 0 0 1 .225-.67Z"/>
  </svg>`,

  volume: `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
    <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z"/>
    <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/>
  </svg>`,

  mute: `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06M6 5.04 4.312 6.39A.5.5 0 0 1 4 6.5H2v3h2a.5.5 0 0 1 .312.11L6 10.96z"/>
    <path d="M7.854 5.646a.5.5 0 0 1 .708 0L11.207 8l-2.645 2.646a.5.5 0 0 1-.708-.708L10.293 8 7.854 5.646z"/>
    <path d="M12.854 5.646a.5.5 0 0 0-.708 0L10.5 7.293 8.854 5.646a.5.5 0 1 0-.708.708L9.793 8l-1.647 1.646a.5.5 0 0 0 .708.708L10.5 8.707l1.646 1.647a.5.5 0 0 0 .708-.708L11.207 8l1.647-1.646a.5.5 0 0 0 0-.708z"/>
  </svg>`,

  tempo: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
    <path d="M8 4.5a.5.5 0 0 1 .5.5v3.61l2.846 2.846a.5.5 0 0 1-.708.708L7.5 9.025V5a.5.5 0 0 1 .5-.5z"/>
  </svg>`,

  skip_forward: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M12.5 4a.5.5 0 0 0-1 0v3.248L5.233 3.612C4.713 3.31 4 3.655 4 4.308v7.384c0 .653.713.998 1.233.696L11.5 8.752V12a.5.5 0 0 0 1 0V4zM5 4.633 10.804 8 5 11.367V4.633z"/>
  </svg>`,

  skip_backward: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M.5 12a.5.5 0 0 0 1 0V8.752l6.267 3.636c.52.302 1.233-.043 1.233-.696V4.308c0-.653-.713-.998-1.233-.696L1.5 7.248V4a.5.5 0 0 0-1 0v8zM7 4.633v6.734L1.196 8 7 4.633z"/>
  </svg>`,

  shuffle: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path fill-rule="evenodd" d="M0 3.5A.5.5 0 0 1 .5 3H1c2.202 0 3.827 1.24 4.874 2.418.49.552.865 1.102 1.126 1.532.26-.43.636-.98 1.126-1.532C9.173 4.24 10.798 3 13 3v1c-1.798 0-3.173 1.01-4.126 2.082A9.624 9.624 0 0 0 7.556 8a9.624 9.624 0 0 0 1.317 1.918C9.828 10.99 11.204 12 13 12v1c-2.202 0-3.827-1.24-4.874-2.418A10.595 10.595 0 0 1 7 9.05c-.26.43-.636.98-1.126 1.532C4.827 11.76 3.202 13 1 13H.5a.5.5 0 0 1 0-1H1c1.798 0 3.173-1.01 4.126-2.082A9.624 9.624 0 0 0 6.444 8a9.624 9.624 0 0 0-1.317-1.918C4.172 5.01 2.796 4 1 4H.5a.5.5 0 0 1-.5-.5z"/>
    <path d="M13 5.466V1.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384l-2.36 1.966a.25.25 0 0 1-.41-.192zm0 9v-3.932a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384l-2.36 1.966a.25.25 0 0 1-.41-.192z"/>
  </svg>`,

  list: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
  </svg>`,

  /** Hamburger menu icon used to toggle the sidebar */
  menu: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M2 4h12v1H2zM2 8h12v1H2zM2 12h12v1H2z"/>
  </svg>`,

  midi: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M8 2a2 2 0 0 0-2 2v1.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 0-.5.5V8a.5.5 0 0 0 .5.5h2a.5.5 0 0 1 .5.5V10a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V9.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 1-.5-.5V4a2 2 0 0 0-2-2H8z"/>
  </svg>`,

  zoom_reset: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <circle cx="7" cy="7" r="3.25" />
    <line x1="9.5" y1="9.5" x2="13" y2="13" />
    <path d="M12 4 A6 6 0 1 0 4 12" />
    <polyline points="12 2 12 4 10 4" />
  </svg>`,

  settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M9.667.667 9 2.333A5.978 5.978 0 0 0 8 2c-.355 0-.702.033-1.037.095L6.333.667H4.667l-.63 1.728a6.095 6.095 0 0 0-1.793 1.037L.667 3.333v1.666l1.728.63c-.062.334-.095.682-.095 1.037 0 .356.033.703.095 1.037l-1.728.63v1.666l1.577.333c.487.764 1.076 1.453 1.793 1.97L4.667 15.333h1.666l.63-1.728c.335.062.682.095 1.037.095.356 0 .703-.033 1.037-.095l.63 1.728h1.666l.63-1.728a6.095 6.095 0 0 0 1.793-1.037l1.577-.333V10.667l-1.728-.63c.062-.334.095-.681.095-1.037 0-.355-.033-.702-.095-1.037l1.728-.63V4.667l-1.577-.333a6.095 6.095 0 0 0-1.793-1.037L11.333.667H9.667zM8 10.333A2.333 2.333 0 1 1 8 5.667a2.333 2.333 0 0 1 0 4.666z"/>
  </svg>`,

  loop_restart: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="pointer-events: none;">
    <path d="M3 4.5v7l5-3.5z"/>
    <rect x="1" y="3" width="2" height="10"/>
    <rect x="9" y="6" width="6" height="1" fill="currentColor" opacity="0.6"/>
    <text x="9.5" y="5.5" font-size="5" font-weight="bold" fill="currentColor">A</text>
    <text x="13" y="5.5" font-size="5" font-weight="bold" fill="currentColor">B</text>
  </svg>`,

  eye_open: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
    <circle cx="8" cy="8" r="2.5" />
  </svg>`,

  eye_closed: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
    <line x1="1" y1="1" x2="15" y2="15" />
  </svg>`,

  /** Pencil icon for edit actions */
  edit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M11.207 2.793a1 1 0 0 1 1.414 0l.586.586a1 1 0 0 1 0 1.414l-8.25 8.25L3 14l.957-1.957 8.25-8.25z" />
  </svg>`,

  /** Overlapping squares icon for duplicate / clone actions */
  duplicate: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <rect x="2" y="2" width="9" height="9" rx="1" />
    <rect x="5" y="5" width="9" height="9" rx="1" />
  </svg>`,

  /** Trash icon used for delete actions */
  trash: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <polyline points="3 4.75 13 4.75" />
    <path d="M6 4.75v7.5" />
    <path d="M10 4.75v7.5" />
    <path d="M5.5 3h5l-.5-1h-4z" />
    <path d="M4.5 4.75 5.3 14a1 1 0 0 0 1 .9h3.4a1 1 0 0 0 1-.9l.8-9.25Z" />
  </svg>`,
};
