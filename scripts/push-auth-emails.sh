#!/usr/bin/env bash
# Pushes the sign-in email templates in supabase/templates to the hosted Supabase project.
# Supabase only uses custom templates with custom SMTP, so without it this exits without changes.
# Needs SUPABASE_ACCESS_TOKEN and PROJECT_REF.
set -euo pipefail

api="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
auth=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
dir="$(dirname "$0")/../supabase/templates"
subject="Your sign-in code"

for file in "$dir"/magic_link.html "$dir"/confirmation.html; do
  grep -qF '{{ .Token }}' "$file" || { echo "$file must show the code ({{ .Token }})"; exit 1; }
done

smtp_host="$(curl -fsS "${auth[@]}" "$api" | jq -r '.smtp_host // ""')"
if [ -z "$smtp_host" ]; then
  echo "::warning::Custom SMTP is not set up, so Supabase sends its default emails, which have no sign-in code. Templates not pushed."
  exit 0
fi

jq -n \
  --arg subject "$subject" \
  --rawfile magic_link "$dir/magic_link.html" \
  --rawfile confirmation "$dir/confirmation.html" \
  '{
    mailer_subjects_magic_link: $subject,
    mailer_templates_magic_link_content: $magic_link,
    mailer_subjects_confirmation: $subject,
    mailer_templates_confirmation_content: $confirmation
  }' |
  curl -fsS -X PATCH "${auth[@]}" -H "Content-Type: application/json" --data-binary @- "$api" -o /dev/null
echo "Pushed the sign-in email templates (SMTP host $smtp_host)."
