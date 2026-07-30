/** @jsxImportSource react */
import { Command } from 'cmdk';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
}

export interface PaletteProps {
  commands: PaletteCommand[];
  query: string;
  onQueryChange?: (value: string) => void;
  onRun?: (value: string) => void;
}

const groups = (commands: PaletteCommand[]): string[] => [...new Set(commands.map((command) => command.group))];

/** A plain cmdk palette — no Janux in this file. */
export function Palette({ commands, query, onQueryChange, onRun }: PaletteProps) {
  return (
    <Command className="palette" label="Command palette" shouldFilter>
      <Command.Input className="palette-input" value={query} onValueChange={onQueryChange} placeholder="Type a command…" />
      <Command.List className="palette-list">
        <Command.Empty className="palette-empty">No matching command.</Command.Empty>
        {groups(commands).map((group) => (
          <Command.Group key={group} heading={group} className="palette-group">
            {commands
              .filter((command) => command.group === group)
              .map((command) => (
                <Command.Item key={command.id} value={command.id} onSelect={onRun} className="palette-item" data-command={command.id}>
                  {command.label}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}
