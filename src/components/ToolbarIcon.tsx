import type { ReactNode } from "react";

export function ToolbarIcon({ kind }: { kind: string }) {
  const common = { width: 28, height: 28, viewBox: "0 0 28 28", "aria-hidden": true } as const;
  const icons: Record<string, ReactNode> = {
    new: (
      <svg {...common}>
        <path d="M6 2h11l5 5v19H6z" fill="#fff" stroke="#6c7c98" />
        <path d="M17 2v6h5" fill="#dfeaff" stroke="#6c7c98" />
      </svg>
    ),
    open: (
      <svg {...common}>
        <path d="M2 9h9l2-4h5l3 4" fill="#ffd94a" stroke="#866700" />
        <path d="M3 10h22l-5 14H1z" fill="#ffcf2e" stroke="#866700" />
        <path d="m16 4 5 5-5 5" fill="none" stroke="#1b8d42" strokeWidth="2" />
      </svg>
    ),
    save: (
      <svg {...common}>
        <path d="M4 3h20v22H4z" fill="#6755c4" stroke="#35337c" />
        <path d="M8 3h12v8H8z" fill="#fff" />
        <path d="M8 16h12v9H8z" fill="#fff" />
        <path d="M17 4v6" stroke="#333" strokeWidth="2" />
      </svg>
    ),
    keyboard: (
      <svg {...common}>
        <path d="M2 12c2-5 21-5 24 0l-2 9c-5 3-16 3-21 0z" fill="#d9dff4" stroke="#555c86" />
        <g fill="#6d67a5">
          <rect x="5" y="12" width="3" height="2" />
          <rect x="10" y="11" width="3" height="2" />
          <rect x="15" y="11" width="3" height="2" />
          <rect x="20" y="12" width="3" height="2" />
          <rect x="8" y="16" width="12" height="2" />
        </g>
      </svg>
    ),
    mouse: (
      <svg {...common}>
        <path d="M8 3c9-4 16 2 15 9-1 9-6 14-12 12S4 8 8 3z" fill="#c8c8c8" stroke="#626262" />
        <path d="M14 2v8" stroke="#777" />
        <path d="M15 3c4 1 6 3 7 6" stroke="#fff" fill="none" />
      </svg>
    ),
    variable: (
      <svg {...common}>
        <path d="M7 3v20" stroke="#ef8917" strokeWidth="3" />
        <path d="m3 8 4-5 4 5" fill="#f7a328" stroke="#a95c00" />
        <path d="M12 8h4v3h-4zm0 5h8v3h-8zm0 5h12v3H12z" fill="#159a38" stroke="#076925" />
      </svg>
    ),
    text: (
      <svg {...common}>
        <rect x="4" y="3" width="20" height="22" fill="#00b66b" stroke="#007d4c" />
        <path d="M7 7h14M7 11h14M7 15h14M7 19h14" stroke="white" strokeWidth="2" />
      </svg>
    ),
    up: (
      <svg {...common}>
        <path d="M14 2 4 13h6v13h8V13h6z" fill="#ffb51e" stroke="#c67300" />
      </svg>
    ),
    down: (
      <svg {...common}>
        <path d="m14 26 10-11h-6V2h-8v13H4z" fill="#ffb51e" stroke="#c67300" />
      </svg>
    ),
    delete: (
      <svg {...common}>
        <path d="M4 4 24 24M24 4 4 24" stroke="#e52b13" strokeWidth="3" />
      </svg>
    ),
    start: (
      <svg {...common}>
        <circle cx="14" cy="14" r="11" fill="#128cf2" stroke="#0968b2" />
        <path d="m11 7 9 7-9 7z" fill="white" />
        <circle cx="14" cy="14" r="8" fill="none" stroke="white" />
      </svg>
    ),
    pause: (
      <svg {...common}>
        <circle cx="14" cy="14" r="11" fill="#e69c14" stroke="#a66b00" />
        <path d="M9 7h4v14H9zm7 0h4v14h-4z" fill="white" />
      </svg>
    ),
    stop: (
      <svg {...common}>
        <circle cx="14" cy="14" r="11" fill="#d83a2f" stroke="#9c1d16" />
        <rect x="8" y="8" width="12" height="12" fill="white" />
      </svg>
    ),
  };
  return icons[kind] ?? <span className="fallback-icon">•</span>;
}
