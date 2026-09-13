'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { ApiClient } from '../../lib/api-client';
import { TreeNodeDto, LivingStatus } from '@kashyap/contracts';

function TreeCanvasContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');
  const { accessToken } = useAuth();
  const token = accessToken;

  const [rootPersonId, setRootPersonId] = useState<string>(focusId || '');
  const [treeData, setTreeData] = useState<TreeNodeDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search selector state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Canvas zoom/pan state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Selected Node Drawer
  const [selectedNode, setSelectedNode] = useState<TreeNodeDto | null>(null);

  useEffect(() => {
    async function initRoot() {
      if (!rootPersonId) {
        try {
          const res = await ApiClient.searchPersons({ limit: 1 }, token || undefined);
          if (res.items.length > 0) {
            setRootPersonId(res.items[0].id);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
    initRoot();
  }, [rootPersonId, token]);

  // Fetch Tree Data
  useEffect(() => {
    if (!rootPersonId) return;
    setLoading(true);
    setError(null);
    ApiClient.getTree(rootPersonId, 3, 3, token || undefined)
      .then((data) => {
        setTreeData(data);
        setSelectedNode(data);
      })
      .catch((err) => setError(err.message || 'रुख लोड गर्न असफल भयो'))
      .finally(() => setLoading(false));
  }, [rootPersonId, token]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length >= 2) {
      const res = await ApiClient.searchPersons({ query: q.trim(), limit: 5 }, token || undefined);
      setSearchResults(res.items);
    } else {
      setSearchResults([]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const renderNode = (node: TreeNodeDto, renderAncestors: boolean = true) => {
    const isSelected = selectedNode?.id === node.id;
    return (
      <div key={node.id} className="flex flex-col items-center">
        {/* Ancestors Subtree (Above Node) */}
        {renderAncestors && node.ancestors && node.ancestors.length > 0 && (
          <div className="flex flex-col items-center mb-2">
            <div className="flex items-end gap-8 relative pb-4">
              {node.ancestors.length > 1 && (
                <div className="absolute bottom-0 left-[15%] right-[15%] h-0.5 bg-saffron-300" />
              )}
              {node.ancestors.map((ancestor) => (
                <div key={ancestor.id} className="relative flex flex-col items-center">
                  {renderNode(ancestor, true)}
                  <div className="w-0.5 h-4 bg-saffron-300 absolute -bottom-4" />
                </div>
              ))}
            </div>
            <div className="w-0.5 h-6 bg-saffron-400" />
            <span className="text-[10px] font-semibold text-saffron-700 bg-saffron-100 px-2 py-0.5 rounded-full mb-1">
              पुर्खा (Ancestor)
            </span>
          </div>
        )}

        {/* Node Box */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setSelectedNode(node);
          }}
          className={`cursor-pointer px-4 py-3 rounded-xl border-2 transition-all shadow-md flex flex-col items-center min-w-[160px] max-w-[200px] ${
            isSelected
              ? 'border-saffron-500 bg-saffron-50 shadow-lg scale-105'
              : 'border-slate-300 bg-white hover:border-saffron-300 hover:shadow'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`w-2 h-2 rounded-full ${
                node.livingStatus === LivingStatus.LIVING ? 'bg-green-500' : 'bg-slate-400'
              }`}
            />
            <span className="text-[10px] font-bold text-slate-500">
              {node.generation ? `G${node.generation}` : 'G?'}
            </span>
          </div>

          <p className="font-bold text-slate-900 text-sm text-center leading-tight">
            {node.nameNepali}
          </p>
          {node.nameEnglish && (
            <p className="text-[11px] text-slate-500 text-center truncate w-full">
              {node.nameEnglish}
            </p>
          )}

          {node.spouses && node.spouses.length > 0 && (
            <div className="mt-2 pt-1 border-t border-slate-100 text-[10px] text-slate-600 text-center w-full">
              दम्पती: {node.spouses.map((s) => s.nameNepali).join(', ')}
            </div>
          )}
        </div>

        {/* Children Subtree */}
        {node.children && node.children.length > 0 && (
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-6 bg-slate-300" />
            <div className="flex items-start gap-8 relative pt-4">
              {node.children.length > 1 && (
                <div className="absolute top-0 left-[15%] right-[15%] h-0.5 bg-slate-300" />
              )}
              {node.children.map((child) => (
                <div key={child.id} className="relative flex flex-col items-center">
                  <div className="w-0.5 h-4 bg-slate-300 absolute -top-4" />
                  {renderNode(child, false)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            अन्तरक्रियात्मक वंशावली रुख (Interactive Tree Canvas)
          </h2>
          <p className="text-xs text-slate-500">
            पुर्खा तथा सन्तानहरूको अन्तरक्रियात्मक दृश्य, जुम, प्यान तथा शाखा अन्वेषण
          </p>
        </div>

        {/* Tree Root Search Selector */}
        <div className="relative w-72">
          <input
            type="text"
            placeholder="केन्द्र व्यक्ति खोज्नुहोस्..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-saffron-500"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-30 divide-y max-h-48 overflow-y-auto">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setRootPersonId(r.id);
                    setSearchResults([]);
                    setSearchQuery('');
                  }}
                  className="p-2 hover:bg-slate-50 cursor-pointer text-xs"
                >
                  <div className="font-bold text-slate-800">{r.primaryNameNepali}</div>
                  <div className="text-[10px] text-slate-500">
                    {r.branchName || '-'} • {r.generation ? `G${r.generation}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
          >
            -
          </button>
          <span className="text-xs font-mono text-slate-600 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.0, s + 0.15))}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
          >
            +
          </button>
          <button
            onClick={() => {
              setScale(1);
              setPosition({ x: 0, y: 0 });
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs ml-2"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Canvas & Sidebar Split */}
      <div className="flex-1 flex gap-4 overflow-hidden relative">
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="flex-1 bg-slate-100/70 rounded-2xl border border-slate-200 overflow-hidden relative cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
        >
          {loading ? (
            <div className="text-slate-500 text-sm">रुख तयार गरिँदैछ (Loading Tree)...</div>
          ) : error ? (
            <div className="text-red-600 text-sm">{error}</div>
          ) : treeData ? (
            <div
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
              className="p-16 inline-block"
            >
              {renderNode(treeData)}
            </div>
          ) : (
            <div className="text-slate-400 text-sm">कुनै व्यक्ति छानिएको छैन</div>
          )}
        </div>

        {/* Selected Node Sidebar */}
        {selectedNode && (
          <div className="w-80 bg-white rounded-2xl border border-slate-200 p-5 shadow-lg flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  व्यक्ति सारांश (Summary)
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕
                </button>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedNode.nameNepali}
                </h3>
                {selectedNode.nameEnglish && (
                  <p className="text-xs text-slate-500">{selectedNode.nameEnglish}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg">
                  <span className="text-slate-500">पुस्ता</span>
                  <p className="font-bold text-slate-800">
                    {selectedNode.generation ? `G${selectedNode.generation}` : '-'}
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg">
                  <span className="text-slate-500">स्थिति</span>
                  <p className="font-bold text-slate-800">
                    {selectedNode.livingStatus === LivingStatus.LIVING ? 'जीवित' : 'दिवंगत'}
                  </p>
                </div>
              </div>

              <div className="text-xs space-y-2">
                <div>
                  <span className="text-slate-500">सन्तान संख्या: </span>
                  <span className="font-semibold text-slate-800">
                    {selectedNode.children ? selectedNode.children.length : 0} जना
                  </span>
                </div>
              </div>

              {/* Relatives Quick Navigation */}
              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <span className="text-[11px] font-bold text-slate-600 block">नातागोता नेभिगेसन (Relatives):</span>
                {selectedNode.ancestors && selectedNode.ancestors.length > 0 && (
                  <div>
                    <span className="text-slate-500 text-[10px]">पुर्खा (Ancestors):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.ancestors.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setRootPersonId(a.id)}
                          className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-200 text-[10px] font-medium"
                        >
                          {a.nameNepali}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.spouses && selectedNode.spouses.length > 0 && (
                  <div>
                    <span className="text-slate-500 text-[10px]">दम्पती (Spouses):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.spouses.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setRootPersonId(s.id)}
                          className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded border border-purple-200 text-[10px] font-medium"
                        >
                          {s.nameNepali}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.children && selectedNode.children.length > 0 && (
                  <div>
                    <span className="text-slate-500 text-[10px]">सन्तान (Children):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.children.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setRootPersonId(c.id)}
                          className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded border border-blue-200 text-[10px] font-medium"
                        >
                          {c.nameNepali}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => setRootPersonId(selectedNode.id)}
                className="w-full py-2 bg-saffron-50 hover:bg-saffron-100 text-saffron-800 text-xs font-bold rounded-lg border border-saffron-200 transition"
              >
                यहाँबाट रुख विस्तार गर्नुहोस् (Center Here)
              </button>
              <Link
                href={`/people/${selectedNode.id}`}
                className="block text-center w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
              >
                पूर्ण प्रोफाइल हेर्नुहोस् (View Profile)
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TreePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 text-sm">रुख लोड हुँदैछ...</div>}>
      <TreeCanvasContent />
    </Suspense>
  );
}
