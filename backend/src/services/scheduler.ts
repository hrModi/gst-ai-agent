import cron from 'node-cron'
import { runReminderJob } from './jobs/reminder-job'
import { runStatusInitJob } from './jobs/status-init-job'
import { runInboxPollJob } from './jobs/inbox-poll-job'

export function startScheduler() {
  // Daily 9 AM IST (03:30 UTC)
  cron.schedule('30 3 * * *', async () => {
    console.log('[Scheduler] Running reminder job...')
    await runReminderJob()
  }, { timezone: 'Asia/Kolkata' })

  // 1st of each month at midnight IST (18:30 UTC previous day — handled by timezone)
  cron.schedule('0 0 1 * *', async () => {
    console.log('[Scheduler] Running status-init job...')
    await runStatusInitJob()
  }, { timezone: 'Asia/Kolkata' })

  // Every 5 minutes — Gmail inbox poll
  cron.schedule('*/5 * * * *', async () => {
    await runInboxPollJob()
  })

  console.log('[Scheduler] Started: reminder-job (daily 9AM IST), status-init-job (1st of month midnight IST), inbox-poll-job (every 5 min)')
}
