import { Mark } from "@qelvora/ui-web";
import "../../../features/media/media.css";
export default function AIVoicePage() {
  return (
    <main className="w6-call">
      <div className="w6-author">
        <Mark kind="ai" />
        <span>AI voice</span>
      </div>
      <h1>AI voice notes</h1>
      <p className="w6-notice">AI voice is not available yet.</p>
      <p className="qv-help">
        It requires an authorized creator voice, separate consent, a spoken AI
        label, verified content credentials and an audio watermark. Human
        recordings are available first.
      </p>
      <a href="/media/voice">Record your own voice</a>
    </main>
  );
}
