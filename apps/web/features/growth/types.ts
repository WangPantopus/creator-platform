export interface Creator {
  id: string;
  version: number;
  handle: string;
  name: string;
  biography: string;
  category: string;
  mode: string;
  state: string;
  topics: string[];
  sourceSummary: string;
  reliability: string;
  capacity: string;
  presence: string;
  photoCaption: string;
  membershipLabel: string | null;
  accessLines: string[];
  updatedAt: string;
}
export interface Post {
  id: string;
  creatorId: string;
  title: string;
  body: string;
  authorLabel: string;
  authorKind: string;
  signedActId: string | null;
  publishedAt: string;
  aiContextEligible: boolean;
}
export interface InboxItem {
  id: string;
  type: string;
  sender: string;
  authorKind: string;
  creatorName: string;
  preview: string;
  destination: string;
  readAt: string | null;
  createdAt: string;
}
export interface Cluster {
  window: string;
  topicKey: string;
  fanCount: number;
  questionCount: number;
  decision: string | null;
  outline: string | null;
}
