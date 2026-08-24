import type { ReactElement } from 'react';
import { ASSET_CATEGORY_TEMPLATES } from '../../../shared/asset-templates';
import type { AssetCategoryTemplate } from '../../../shared/asset-templates';
import { Card } from '../ui/Card';

interface Props {
  onPick: (template: AssetCategoryTemplate) => void;
}

/**
 * The 雛形 shortcut.
 *
 * Asset tracking is optional, so nothing is created until one of these is
 * chosen -- picking a template just opens the category dialog pre-filled, which
 * keeps the user in charge of the shape and lets them edit it before it exists.
 */
function AssetTemplatePicker({ onPick }: Props): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ASSET_CATEGORY_TEMPLATES.map((template) => (
        <Card
          key={template.key}
          padding="md"
          interactive
          onClick={() => onPick(template)}
          onKeyDown={(e) => {
            // Card renders role="button" on a div, so Enter/Space have to be
            // wired up by hand for keyboard users.
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(template);
            }
          }}
          className="text-left"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: template.color }}
            />
            <span className="font-medium text-[var(--color-content-primary)]">{template.name}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-content-muted)]">{template.description}</p>
          {template.fields.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-content-secondary)]">
              {template.fields.map((f) => f.label).join(' / ')}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

export default AssetTemplatePicker;
