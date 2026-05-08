"use client";

import { FormEvent } from "react";
import { Icon } from "@/components/atoms/Icon";
import styled from "styled-components";

const Form = styled.form`
  margin-top: 0;
`;

const InputRow = styled.div`
  display: flex;
  align-items: center;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--branch-accent) 22%, var(--border));
  background: var(--input-bg);
  padding: 0.75rem 1rem;
  box-shadow: var(--shadow-raised);
`;

const TextInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 1rem;
  color: var(--text-primary);

  &::placeholder {
    color: var(--text-subtle);
  }

  &:disabled {
    opacity: 0.6;
  }
`;

const SendButton = styled.button`
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9999px;
  background: var(--send-bg);
  color: var(--send-fg, #fff);
  cursor: pointer;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const Hint = styled.p`
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
`;

type PromptComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "교리 관련 질문을 입력하세요...",
}: PromptComposerProps) {
  return (
    <Form onSubmit={onSubmit}>
      <InputRow>
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <SendButton type="submit" disabled={disabled || !value.trim()}>
          <Icon name="send" size={20} />
        </SendButton>
      </InputRow>
      <Hint>※ 자동 모드에서는 질문 유형에 따라 교리 RAG 또는 일반 채팅으로 응답합니다.</Hint>
    </Form>
  );
}
