/**
 * File: apps/web/src/components/ui/icons.tsx
 * Purpose: The small set of line icons the screens use, drawn as inline SVG so no icon library is needed.
 * Every icon is decorative (aria-hidden); the text next to it carries the meaning.
 *
 * Functions:
 * - Svg({ children, className, strokeWidth }): shared 24x24 stroked SVG wrapper.
 * - CheckIcon(props): the check icon.
 * - ClockIcon(props): the clock icon.
 * - AlertIcon(props): the alert icon.
 * - LockIcon(props): the lock icon.
 * - ArrowRightIcon(props): the arrow right icon.
 * - ArrowLeftIcon(props): the arrow left icon.
 * - ChevronLeftIcon(props): the chevron left icon.
 * - ChevronRightIcon(props): the chevron right icon.
 * - DownloadIcon(props): the download icon.
 * - UploadIcon(props): the upload icon.
 * - PlayIcon(props): the play icon.
 * - PlusIcon(props): the plus icon.
 * - CloseIcon(props): the close icon.
 * - FileIcon(props): the file icon.
 * - WhatsAppIcon(props): the whatsapp icon.
 */
import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ children, className = "size-5", strokeWidth = 2 }: { children: ReactNode; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

export const CheckIcon = (props: IconProps) => <Svg {...props} strokeWidth={2.5}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const ClockIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const AlertIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.4v.1" /></Svg>;
export const LockIcon = (props: IconProps) => <Svg {...props}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const ArrowRightIcon = (props: IconProps) => <Svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const ArrowLeftIcon = (props: IconProps) => <Svg {...props}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const ChevronLeftIcon = (props: IconProps) => <Svg {...props}><path d="M15 5l-7 7 7 7" /></Svg>;
export const ChevronRightIcon = (props: IconProps) => <Svg {...props}><path d="M9 5l7 7-7 7" /></Svg>;
export const DownloadIcon = (props: IconProps) => <Svg {...props}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></Svg>;
export const UploadIcon = (props: IconProps) => <Svg {...props}><path d="M12 20V9M7 13.5l5-5 5 5M5 4h14" /></Svg>;
export const PlayIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={props.className ?? "size-5"} fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
);
export const PlusIcon = (props: IconProps) => <Svg {...props}><path d="M12 5v14M5 12h14" /></Svg>;
export const CloseIcon = (props: IconProps) => <Svg {...props}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const FileIcon = (props: IconProps) => <Svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>;
export const WhatsAppIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={props.className ?? "size-5"} fill="currentColor">
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.2-1.36A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.08.8.82-3-.2-.31a8.2 8.2 0 1 1 6.96 3.84zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.13-.55.12-.17.25-.64.8-.78.96-.14.17-.29.19-.53.06a6.7 6.7 0 0 1-1.98-1.22 7.4 7.4 0 0 1-1.37-1.7c-.14-.25 0-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.04c0 1.2.88 2.37 1 2.53.12.17 1.73 2.64 4.2 3.7.58.25 1.04.4 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.46-.6 1.66-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.17-.47-.29z" />
  </svg>
);
