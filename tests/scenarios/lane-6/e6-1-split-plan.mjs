// The areas of Studio.tsx that remain after Thanks, More and Team, in the order to move them. Each area is
// one pull request. For every new file: the top-level declarations to copy (in their original order),
// which of them get `export`, and the file's imports (already Prettier-formatted, so a run needs no
// reformatting of them). `studioImports` are added to Studio.tsx. Apply one area with
// `node tests/scenarios/lane-6/e6-1-extract.mjs <area>`.
export const plan = {
  notes: {
    branch: "lane-6/studio-split-notes",
    title: "Notes and Compose",
    files: [
      {
        dest: "notes/Notes.tsx",
        names: ["Notes"],
        exports: ["Notes"],
        header: `"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCopy } from "@qelvora/copy";
import { EmptyState, Message, Note, ReactionChip } from "@qelvora/ui-web";
import type {
  ContentView,
  PrivateNoteReply,
} from "../../../../../packages/api/src/content";
import { ContentReplyList } from "../../../../../packages/api/src/content";
import { SignedActReview } from "../../identity/signing";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { contentStateLabel, key, time } from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator, Page } from "../shared/types";`,
      },
      {
        dest: "notes/Compose.tsx",
        names: ["emptyBody", "scheduleInput", "Compose"],
        exports: ["Compose"],
        header: `"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthorLabel, Notice } from "@qelvora/ui-web";
import type { SignedActCommand } from "@qelvora/api";
import type {
  ContentBody,
  ContentView,
  PrivateNoteReply,
} from "../../../../../packages/api/src/content";
import { SignedActReview } from "../../identity/signing";
import { CreatorVoiceRecording } from "../../media/VoiceRecorder";
import { PhotoAttachment } from "../PhotoAttachment";
import { PostVoiceAttachment } from "../PostVoiceAttachment";
import { StudioFailure, studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { contentStateLabel, key, time } from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator, Page } from "../shared/types";`,
      },
    ],
    studioImports: [
      'import { Notes } from "./notes/Notes";',
      'import { Compose } from "./notes/Compose";',
    ],
  },
  library: {
    branch: "lane-6/studio-split-library",
    title: "Publish (the library)",
    files: [
      {
        dest: "library/Library.tsx",
        names: ["Library"],
        exports: ["Library"],
        header: `"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState, Notice } from "@qelvora/ui-web";
import type { ContentView } from "../../../../../packages/api/src/content";
import { studioRequest } from "../api";
import { Compose } from "../notes/Compose";
import { Feedback, useAction } from "../shared/action";
import { contentStateLabel, key, time } from "../shared/format";
import type { Creator, Page } from "../shared/types";`,
      },
    ],
    studioImports: ['import { Library } from "./library/Library";'],
  },
  requests: {
    branch: "lane-6/studio-split-requests",
    title: "Requests and PacketDetail",
    files: [
      {
        dest: "requests/Requests.tsx",
        names: ["Requests"],
        exports: ["Requests"],
        header: `"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CapacityHeader, EmptyState, QueueCard } from "@qelvora/ui-web";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { money, time } from "../shared/format";
import type { Creator, Queue } from "../shared/types";`,
      },
      {
        dest: "requests/PacketDetail.tsx",
        names: ["PacketDetail"],
        exports: ["PacketDetail"],
        header: `"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuditBanner,
  AuthorLabel,
  LabelPreview,
  Notice,
} from "@qelvora/ui-web";
import type { SignedActCommand } from "@qelvora/api";
import {
  ConversationMessageSchema,
  type ConversationMessage,
} from "../../../../../packages/api/src/conversation/contracts";
import { SignedActReview } from "../../identity/signing";
import { VoicePlayer } from "../../media/VoicePlayer";
import { ApprovedReply } from "../ApprovedReply";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import {
  key,
  money,
  packetStateLabel,
  paymentStateLabel,
  time,
} from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator, Packet } from "../shared/types";`,
      },
    ],
    studioImports: [
      'import { Requests } from "./requests/Requests";',
      'import { PacketDetail } from "./requests/PacketDetail";',
    ],
  },
  threads: {
    branch: "lane-6/studio-split-threads",
    title: "Threads and CorrectionForm",
    files: [
      {
        dest: "threads/CorrectionForm.tsx",
        names: ["CorrectionForm"],
        exports: ["CorrectionForm"],
        header: `"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Notice } from "@qelvora/ui-web";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { key } from "../shared/format";
import type { Creator } from "../shared/types";`,
      },
      {
        dest: "threads/Threads.tsx",
        names: ["Threads"],
        exports: ["Threads"],
        header: `"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy } from "@qelvora/copy";
import {
  AuditBanner,
  AuthorLabel,
  EmptyState,
  LabelPreview,
  Message,
  Notice,
} from "@qelvora/ui-web";
import { MessageSchema } from "@qelvora/api";
import { ConversationCorrectionMessageSchema } from "../../../../../packages/api/src/conversation/correction";
import { SignedActReview } from "../../identity/signing";
import { ApprovedReply } from "../ApprovedReply";
import { ConversationVoiceReply } from "../ConversationVoiceReply";
import { CorrectionReply } from "../CorrectionReply";
import { StudioFailure, studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { key, speakerLabel } from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator } from "../shared/types";
import { CorrectionForm } from "./CorrectionForm";`,
      },
    ],
    studioImports: ['import { Threads } from "./threads/Threads";'],
  },
  shell: {
    branch: "lane-6/studio-split-shell",
    title: "navigation helpers and the requests count",
    files: [
      {
        dest: "shell/navigation.tsx",
        names: ["words", "navigationTree", "studioSidebar"],
        exports: ["navigationTree", "studioSidebar"],
        header: `"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Sidebar } from "@qelvora/ui-web";`,
      },
      {
        dest: "shell/useRequestsCount.ts",
        names: ["useRequestsCount"],
        exports: ["useRequestsCount"],
        header: `"use client";
import { useEffect, useState } from "react";
import { studioRequest } from "../api";
import type { Creator, Queue } from "../shared/types";`,
      },
    ],
    studioImports: [
      'import { navigationTree, studioSidebar } from "./shell/navigation";',
      'import { useRequestsCount } from "./shell/useRequestsCount";',
    ],
  },
};
