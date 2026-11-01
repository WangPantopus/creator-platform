"use client";
import * as React from "react";
import { QueueCard } from "@qelvora/ui-web";

// Queue actions render only with real behavior. The design shows them, so the
// catalog supplies inert handlers here, inside the client boundary, because a
// server-rendered catalog cannot pass functions.
export function ReferenceQueueCard(
  props: React.ComponentProps<typeof QueueCard>,
): React.ReactElement {
  return React.createElement(QueueCard, {
    onOpen: () => {},
    onDecline: () => {},
    ...props,
  });
}
