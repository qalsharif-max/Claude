// Standalone reminder runner — useful for an external cron job or a manual run:
//   node src/run-reminders.js          (send due reminders)
//   node src/run-reminders.js --preview (show what would be sent, send nothing)
import 'dotenv/config';
import { runReminders } from './reminders.js';

const dryRun = process.argv.includes('--preview') || process.argv.includes('--dry-run');

const result = await runReminders({ dryRun });

if (result.due.length === 0) {
  console.log('No documents are due for a reminder.');
} else {
  console.log(`${result.due.length} document(s) due${dryRun ? ' (preview only)' : ''}:`);
  for (const d of result.due) {
    console.log(`  - ${d.person_name}: ${d.doc_type}${d.label ? ` (${d.label})` : ''} — expiry ${d.expiry_date} — ${d.days_left} day(s) left`);
  }
  if (!dryRun) {
    console.log(result.sent ? `Email sent via ${result.mode} to ${result.recipients.join(', ')}` : `Email NOT sent: ${result.error}`);
  }
}
process.exit(0);
