import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('presents the local annotation import fields', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: '专家标注平台' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('选择标注 JSON')).toBeInTheDocument();
    expect(screen.getByLabelText('选择对应 PDF')).toBeInTheDocument();
  });
});
