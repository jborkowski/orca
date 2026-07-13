import {
  logSharedControlParked,
  logSharedControlRevived,
  scheduleSharedControlReconnectOrFinish
} from './remote-runtime-shared-control-reconnect'

export class SharedControlRecovery {
  timer: ReturnType<typeof setTimeout> | null = null
  reconnectAttempt = 0
  parked = false

  clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  markOpening(): void {
    this.clearTimer()
    this.parked = false
  }

  close(): void {
    this.clearTimer()
    this.parked = false
  }

  revive(environmentId: string | undefined, intentionallyClosed: boolean, open: () => void): void {
    if (intentionallyClosed || (!this.parked && this.timer === null)) {
      return
    }
    const wasParked = this.parked
    this.clearTimer()
    this.parked = false
    this.reconnectAttempt = 0
    logSharedControlRevived(environmentId, wasParked)
    open()
  }

  schedule(args: {
    environmentId?: string
    intentionallyClosed: boolean
    subscriptionCount: number
    open: () => void
  }): void {
    const scheduled = scheduleSharedControlReconnectOrFinish({
      current: this.timer,
      intentionallyClosed: args.intentionallyClosed,
      reconnectAttempt: this.reconnectAttempt,
      delaysMs: [250, 500, 1000, 2000, 4000, 8000, 15_000],
      open: () => {
        this.timer = null
        args.open()
      }
    })
    this.timer = scheduled.timer
    this.reconnectAttempt = scheduled.reconnectAttempt
    this.parked = scheduled.parked
    if (scheduled.parked) {
      logSharedControlParked({
        environmentId: args.environmentId,
        reconnectAttempt: this.reconnectAttempt,
        subscriptionCount: args.subscriptionCount
      })
    }
  }
}
