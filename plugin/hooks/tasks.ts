// Tasks typed on the office page. The server leases each one to a session of its
// project; this plugin submits it as the person's own prompt and reports back.

// Read by the model beside each office task, never shown to the person: the team
// as the setup page launched it, so the model can pick agents by name and skills.
export function teamNote(roles: readonly { name: string; title: string; person?: string; skills: readonly string[]; agentType?: string }[]): string {
  if (!roles.length) return 'This task was sent from the Agent Office page.'

  const team = roles
    .map((r) => `${r.agentType ?? r.name} (${r.person ? `${r.person}, ${r.title}` : r.title}; skills: ${r.skills.join(', ') || 'none'})`)
    .join('; ')

  return (
    'This task was sent from the Agent Office page. The team is available as these agent types: ' +
    `${team}. Start the ones that fit parts of the task, and keep coordinating and reporting back.`
  )
}

/** Whether a prompt came from this plugin as the person's own words, which is how page tasks are submitted. */
export function isPageTask(origin: { kind: string; name?: string; asUser?: boolean } | undefined, pluginName: string): boolean {
  return origin?.kind === 'plugin' && origin.name === pluginName && origin.asUser === true
}
