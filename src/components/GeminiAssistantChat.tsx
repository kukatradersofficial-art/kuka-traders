import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import type { AppLanguage, Product } from '../types';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface GeminiAssistantChatProps {
  products: Product[];
  language: AppLanguage;
}

const QUICK_PROMPTS = [
  'Do you have P Mark Atta and Taj Mahal Mustard Oil?',
  'What are delivery charges for Main Bazar Sopore?',
  'Show me cattle feed and dry fruits prices',
];

export const GeminiAssistantChat: React.FC<GeminiAssistantChatProps> = ({
  products,
  language,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text:
        language === 'ur'
          ? 'السلام علیکم! کوکا ٹریڈرز سوپور اسسٹنٹ میں خوش آمدید۔ دالیں، آٹا، تیل، مصالحے یا ڈیلیوری کے بارے میں پوچھیں۔'
          : 'Assalamu Alaikum! Welcome to KUKA TRADERS Sopore. Ask me about groceries, pack sizes, live prices, cattle feed, or delivery in 193201.',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const updatedHistory = [...messages];
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const catalogContext = products
        .filter((p) => !p.isDeleted)
        .slice(0, 60)
        .map((p) => ({
          name: p.name,
          brand: p.brand,
          packSize: p.packSize,
          sellingPrice: p.sellingPrice,
          priceStatus: p.priceStatus,
          stockQuantity: p.stockQuantity,
          categoryName: p.categoryName,
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: updatedHistory,
          catalogContext,
          language,
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Unable to get a response from the assistant.');
      }

      setMessages((prev) => [...prev, { role: 'model', text: data.reply! }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open KUKA TRADERS Grocery Assistant"
        className="fixed bottom-20 md:bottom-6 right-4 md:right-20 z-40 h-12 px-4 rounded-full bg-stone-900 text-white shadow-lg hover:bg-stone-800 transition-all flex items-center gap-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
      >
        <Bot className="w-4 h-4 text-[#F36B16]" />
        <span>Store Assistant</span>
      </button>

      {isOpen && (
        <div
          className="fixed bottom-36 md:bottom-22 right-4 md:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 bg-white rounded-2xl border border-stone-200 shadow-2xl flex flex-col overflow-hidden max-h-[70vh]"
          role="dialog"
          aria-label="KUKA TRADERS Assistant Chat"
        >
          <div className="px-4 py-3 bg-stone-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F36B16] flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-display font-bold text-sm leading-tight">KUKA Shop Assistant</p>
                <p className="text-[11px] text-stone-300">Sopore Grocery &amp; Order Help</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
              className="w-8 h-8 rounded-lg hover:bg-stone-800 flex items-center justify-center text-stone-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#F36B16] text-white rounded-br-sm'
                      : 'bg-white border border-stone-200 text-stone-800 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-stone-200 text-stone-500 rounded-2xl px-3.5 py-2 text-xs">
                  Checking KUKA TRADERS catalog...
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {messages.length <= 2 && (
            <div className="px-3 py-2 border-t border-stone-100 bg-white flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="text-[11px] text-left px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-orange-50 hover:text-[#F36B16] text-stone-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-3 border-t border-stone-200 bg-white flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about groceries, prices, Sopore delivery..."
              className="flex-1 px-3 py-2 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F36B16]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="w-10 h-10 rounded-xl bg-[#F36B16] text-white flex items-center justify-center hover:bg-[#D95708] disabled:opacity-50 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
