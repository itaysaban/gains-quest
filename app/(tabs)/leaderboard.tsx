import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/EmptyState';

// Leaderboard is PRD milestone M4 (Social) — deferred. Placeholder keeps the confirmed 4-tab shape
// intact now rather than adding a tab later, which would be a more jarring nav change than this.
export default function Leaderboard() {
  return (
    <Screen>
      <EmptyState
        icon="trophy-outline"
        title="Leaderboard coming soon"
        message="Friends and global rankings are on the way — for now, focus on beating your own numbers."
      />
    </Screen>
  );
}
