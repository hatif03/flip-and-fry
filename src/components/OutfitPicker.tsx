import { Check } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { isOutfitColor, OUTFIT_COLORS, outfitColor, type ChefOutfit, type OutfitColor, type OutfitPart } from '@/game/chef-outfit';
import { cn } from '@/lib/utils';

interface OutfitPickerProps { outfit: ChefOutfit; onChange: (part: OutfitPart, color: OutfitColor) => void; }
/** Labeled, keyboard-accessible palettes; selected state never depends on color alone. */
export function OutfitPicker({ outfit, onChange }: OutfitPickerProps) {
  return <div className="space-y-5">{(['hat', 'apron'] as const).map(part => <fieldset key={part}>
    <legend className="mb-2 flex w-full items-center justify-between gap-3"><span className="font-display text-xl">{part === 'hat' ? 'Chef’s hat' : 'Apron'}</span><span className="text-xs font-extrabold text-ink/60">{outfitColor(outfit[part]).name}</span></legend>
    <RadioGroup aria-label={part === 'hat' ? 'Hat color' : 'Apron color'} value={outfit[part]} onValueChange={color => { if (isOutfitColor(color)) onChange(part, color); }} className="grid grid-cols-6 gap-1.5 max-[359px]:grid-cols-3">
      {OUTFIT_COLORS.map(color => <label key={color.id} className="flex cursor-pointer flex-col items-center gap-1.5">
        <span className="relative flex size-11 items-center justify-center">
          <RadioGroupItem value={color.id} aria-label={color.name} className={cn('size-11 border-2 border-ink/15 shadow-sm transition-transform duration-150 hover:scale-105 focus-visible:ring-gold focus-visible:ring-offset-paper [&>span]:hidden motion-reduce:transition-none', color.swatch, outfit[part] === color.id && 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper')} />
          {outfit[part] === color.id && <Check aria-hidden="true" className={cn('pointer-events-none absolute size-5', color.id === 'tomato' || color.id === 'dusk' ? 'text-paper' : 'text-ink')} strokeWidth={3} />}
        </span><span className="text-[10px] font-extrabold text-ink/75">{color.name}</span>
      </label>)}
    </RadioGroup>
  </fieldset>)}</div>;
}
