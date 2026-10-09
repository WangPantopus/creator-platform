# Lane status files

Each lane keeps `lane-N.md` here, updated in every pull request. The integrator aggregates them
into [CURRENT](../../operations/CURRENT.md).

```
# Lane N: <name> status
Updated: <date>, by <agent or person>
Working on: <WP and pull request>
Done: <WPs and pull requests merged or open>
Next: <the next WP>
Blocked on: <founder input, another lane's contract, a migration slot>
Scenarios: <ID: pass / fail / not run, date, the command to re-run it>
Tickets to other lanes: <lane, file, change, why>
```

Keep it short. A fresh session must be able to resume the lane from this file and the lane's open
pull requests.
