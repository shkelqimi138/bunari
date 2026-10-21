// A date typed on the number pad as DD.MM.YYYY: the dots appear by themselves, day, month and year
// keep their places when one is edited, and the cursor stays where the user is editing
import { useRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { editTypedDate, type TextSelection } from '@/domain/typed-date';

type DateFieldProps = Omit<
  TextInputProps,
  'keyboardType' | 'maxLength' | 'onChangeText' | 'onSelectionChange' | 'placeholder' | 'value'
> & {
  // Called with the formatted text (DD.MM.YYYY, possibly unfinished); `typedDateToStored` checks it.
  onChangeText: (value: string) => void;
  value: string;
};

export function DateField({ onChangeText, value, ...props }: DateFieldProps) {
  const inputRef = useRef<TextInput>(null);
  // The cursor as the field last reported it, i.e. where it was just before the next edit.
  const selection = useRef<TextSelection>({ end: value.length, start: value.length });

  const handleChangeText = (changed: string) => {
    const next = editTypedDate(value, selection.current, changed);
    selection.current = { end: next.caret, start: next.caret };
    onChangeText(next.text);
    // Setting the text puts the cursor at the end; once the new text is shown, put it back.
    requestAnimationFrame(() => inputRef.current?.setSelection(next.caret, next.caret));
  };

  return (
    <TextInput
      {...props}
      keyboardType="number-pad"
      maxLength={10}
      onChangeText={handleChangeText}
      onSelectionChange={(event) => {
        selection.current = event.nativeEvent.selection;
      }}
      placeholder="DD.MM.YYYY"
      ref={inputRef}
      value={value}
    />
  );
}
