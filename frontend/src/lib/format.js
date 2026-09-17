export function clock(date) {
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

export function timeAgo(iso) {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export function duration(ms) {
  if (ms == null) return ''
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

const pkg = (p) => `${p.name}@${p.version ?? p.to}`

/** Turns a backend event into a log line: which tag, which colour, what happened. */
export function describeEvent(event) {
  const d = event.data ?? {}
  switch (event.type) {
    case 'file-changed':
      return { tag: 'file', tone: 'muted', text: `${d.file} changed on disk` }
    case 'scan-started':
      return { tag: 'scan', tone: 'amber', text: `Scan started (${d.trigger})` }
    case 'scan-completed': {
      const c = d.changes ?? {}
      const parts = []
      if (c.added) parts.push(`+${c.added} added`)
      if (c.updated) parts.push(`~${c.updated} updated`)
      if (c.removed) parts.push(`−${c.removed} removed`)
      if (c.newVulnerabilities) parts.push(`${c.newVulnerabilities} new vulnerabilities`)
      if (c.resolvedVulnerabilities) parts.push(`${c.resolvedVulnerabilities} resolved`)
      const tail = parts.length ? ` — ${parts.join(', ')}` : ''
      return {
        tag: 'scan',
        tone: 'green',
        text: `Scan finished in ${duration(d.durationMs)} · risk ${d.summary?.riskScore} (${d.summary?.riskLevel})${tail}`,
      }
    }
    case 'scan-failed':
      return { tag: 'scan', tone: 'red', text: `Scan failed: ${d.message}` }
    case 'dependencies-changed': {
      const bits = [
        ...(d.added ?? []).map((p) => `+ ${pkg(p)}`),
        ...(d.updated ?? []).map((p) => `~ ${p.name} ${p.from} → ${p.to}`),
        ...(d.removed ?? []).map((p) => `− ${pkg(p)}`),
      ]
      return { tag: 'deps', tone: 'amber', text: bits.join('   ') }
    }
    case 'vulnerabilities-detected': {
      const f = d.findings?.[0]
      const more = d.count > 1 ? ` (+${d.count - 1} more)` : ''
      return { tag: 'vuln', tone: 'red', text: `${d.count} new · ${f?.osvId} in ${f?.package}@${f?.version}${more}` }
    }
    case 'vulnerabilities-resolved':
      return { tag: 'vuln', tone: 'green', text: `${d.count} resolved · ${d.findings?.[0]?.package} no longer present` }
    case 'simulation-completed':
      return {
        tag: 'ripple',
        tone: d.reachesApplication ? 'red' : 'muted',
        text: `Compromise of ${d.initialPackage} reaches ${d.affectedNodes} nodes · blast radius ${(d.blastRadius * 100).toFixed(1)}%`,
      }
    case 'mitigation-completed':
      return {
        tag: 'ripple',
        tone: 'green',
        text: `Blocking ${d.blockedPackages?.join(', ')} cuts blast radius ${(d.originalBlastRadius * 100).toFixed(1)}% → ${(d.mitigatedBlastRadius * 100).toFixed(1)}% (−${d.reductionPercentage}%)`,
      }
    case 'project-added':
      return { tag: 'watch', tone: 'green', text: `Now watching ${d.path}` }
    case 'watcher-error':
      return { tag: 'watch', tone: 'red', text: `Watcher error: ${d.message}` }
    default:
      return { tag: event.type, tone: 'muted', text: JSON.stringify(d) }
  }
}
