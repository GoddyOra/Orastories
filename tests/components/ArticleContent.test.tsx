import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArticleContent from '../../components/ArticleContent';

// ArticleContent is the app's main defense against arbitrary HTML injection
// from user-submitted article bodies (see its own header comment: "never
// raw HTML, never dangerouslySetInnerHTML") - a regression here is a real
// security bug, not just a cosmetic one, so it's the first thing covered.

describe('ArticleContent', () => {
  it('renders plain paragraphs', () => {
    render(<ArticleContent body="Hello world." theme="light" />);
    expect(screen.getByText('Hello world.')).toBeInTheDocument();
  });

  it('splits blank-line-separated text into separate paragraphs', () => {
    const { container } = render(<ArticleContent body={'First paragraph.\n\nSecond paragraph.'} theme="light" />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('renders **bold** and *italic* as real elements, not literal asterisks', () => {
    render(<ArticleContent body="This is **bold** and this is *italic*." theme="light" />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });

  it('renders [url=...]...[/url] as a real link with target=_blank and rel=noopener', () => {
    render(<ArticleContent body="[url=https://example.com]click here[/url]" theme="light" />);
    const link = screen.getByRole('link', { name: 'click here' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders "## " lines as headings', () => {
    render(<ArticleContent body="## Section Title" theme="light" />);
    expect(screen.getByRole('heading', { name: 'Section Title' })).toBeInTheDocument();
  });

  it('renders "> " lines as a blockquote', () => {
    const { container } = render(<ArticleContent body="> A quoted line" theme="light" />);
    expect(container.querySelector('blockquote')).toHaveTextContent('A quoted line');
  });

  it('renders [code]...[/code] as a code block without interpreting markup inside it', () => {
    const { container } = render(<ArticleContent body="[code]const x = **not bold**;[/code]" theme="light" />);
    const code = container.querySelector('pre code');
    expect(code).toHaveTextContent('const x = **not bold**;');
  });

  it('renders [img]url[/img] as a real <img> with an empty alt (decorative)', () => {
    const { container } = render(<ArticleContent body="[img]https://example.com/pic.jpg[/img]" theme="light" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/pic.jpg');
    expect(img).toHaveAttribute('alt', '');
  });

  it('never renders raw HTML tags in the body as actual elements (XSS safety)', () => {
    const { container } = render(
      <ArticleContent body='<script>alert(1)</script><img src=x onerror="alert(1)">' theme="light" />
    );
    // The dangerous markup must appear as literal, inert text - not as a
    // real <script> or an <img> with a live onerror handler.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });
});
