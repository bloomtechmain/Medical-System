import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiSelectWithCustom from './MultiSelectWithCustom';

// Requirement 2: "There should be one button like as select to all of
// specializations!" — a large hospital offering most of the list was ticking
// seventeen boxes one at a time. These cover the select-all/clear pair added
// to fix that, plus that they do not disturb a hand-typed custom entry.

const OPTIONS = ['Cardiology', 'Dermatology', 'Neurology'];

describe('MultiSelectWithCustom select-all / clear', () => {
  it('selects every predefined option, preserving an existing custom entry', async () => {
    const onChange = vi.fn();
    render(
      <MultiSelectWithCustom options={OPTIONS} selected={['Sports Medicine']} onChange={onChange} />
    );

    await userEvent.click(screen.getByRole('button', { name: /select all/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as string[];
    expect(new Set(next)).toEqual(new Set(['Sports Medicine', ...OPTIONS]));
  });

  it('is disabled once every predefined option is already selected', () => {
    render(
      <MultiSelectWithCustom options={OPTIONS} selected={[...OPTIONS]} onChange={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /select all/i })).toBeDisabled();
  });

  it('clear removes only predefined options, leaving custom entries alone', async () => {
    const onChange = vi.fn();
    render(
      <MultiSelectWithCustom
        options={OPTIONS}
        selected={['Cardiology', 'Dermatology', 'Sports Medicine']}
        onChange={onChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));

    expect(onChange).toHaveBeenCalledWith(['Sports Medicine']);
  });

  it('disables clear when nothing is selected', () => {
    render(<MultiSelectWithCustom options={OPTIONS} selected={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeDisabled();
  });

  it('still supports ticking a single box by hand', async () => {
    const onChange = vi.fn();
    render(<MultiSelectWithCustom options={OPTIONS} selected={[]} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Cardiology'));

    expect(onChange).toHaveBeenCalledWith(['Cardiology']);
  });

  it('adds a typed custom entry alongside the predefined ones', async () => {
    const onChange = vi.fn();
    render(<MultiSelectWithCustom options={OPTIONS} selected={['Cardiology']} onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText('Add a custom entry...'), 'Sports Medicine{enter}');

    expect(onChange).toHaveBeenCalledWith(['Cardiology', 'Sports Medicine']);
  });
});
