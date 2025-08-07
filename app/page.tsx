"use client";

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { Filter, FilterX } from "lucide-react";

export default function Home() {
  const [report, setReport] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    role: "",
    evaluation: "",
    nameSearch: "",
  });

  const processExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setError("Vui lòng chọn file Excel!");
      return;
    }

    setIsLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("Không tìm thấy sheet!");
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
        }) as any[][];

        const shippers = jsonData
          .slice(1)
          .filter(
            (row: any[]) =>
              row[7] === "Shipper-chính thức" || row[7] === "Admin"
          );

        if (shippers.length === 0)
          throw new Error("Không có dữ liệu Shipper-chính thức hoặc Admin!");

        const reportData = calculateReport(shippers);
        setReport(reportData);
      } catch (err) {
        setError(`Lỗi: ${(err as Error).message}`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Lỗi đọc file!");
      setIsLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const calculateReport = (shippers: any[]) => {
    const report: any[] = [];
    const shipperMap = new Map();

    shippers.forEach((row: any[]) => {
      const name = row[6];
      const role = row[7];
      const orders = parseInt(row[8]) || 0;
      const signed = parseInt(row[9]) || 0;
      const unsigned = orders - signed;

      if (shipperMap.has(name)) {
        const data = shipperMap.get(name);
        data.orders += orders;
        data.signed += signed;
        data.unsigned += unsigned;
      } else {
        shipperMap.set(name, { orders, signed, unsigned, role });
      }
    });

    let totalOrders = 0;
    let totalSigned = 0;
    let totalUnsigned = 0;

    shipperMap.forEach((data, name) => {
      totalOrders += data.orders;
      totalSigned += data.signed;
      totalUnsigned += data.unsigned;

      const ratio = data.orders > 0 ? (data.signed / data.orders) * 100 : 0;
      const target60 = data.orders * 0.6;
      const shortfall60 = target60 - data.signed;

      const t1 = ratio - 60;
      const t2 = ratio - 70;

      report.push({
        name,
        role: data.role,
        orders: data.orders,
        signed: data.signed,
        unsigned: data.unsigned,
        ratio: ratio.toFixed(2) + "%",
        evaluation: ratio >= 60 ? "Đạt" : "Không đạt",
        target60: Math.round(target60),
        shortfall60: Math.max(0, Math.round(shortfall60)),
        t1: t1.toFixed(2) + "%",
        t2: t2.toFixed(2) + "%",
      });
    });

    report.sort((a, b) => a.name.localeCompare(b.name));

    const totalRatio = totalOrders > 0 ? (totalSigned / totalOrders) * 100 : 0;
    const totalTarget60 = totalOrders * 0.6;
    const totalShortfall60 = totalTarget60 - totalSigned;
    const totalT1 = totalRatio - 60;
    const totalT2 = totalRatio - 70;

    report.push({
      name: "TỔNG",
      role: "",
      orders: totalOrders,
      signed: totalSigned,
      unsigned: totalUnsigned,
      ratio: totalRatio.toFixed(2) + "%",
      evaluation: totalRatio >= 60 ? "Đạt" : "Không đạt",
      target60: Math.round(totalTarget60),
      shortfall60: Math.max(0, Math.round(totalShortfall60)),
      t1: totalT1.toFixed(2) + "%",
      t2: totalT2.toFixed(2) + "%",
    });

    return report;
  };

  const getEvaluationClass = (row: any, rowIndex: number) => {
    if (row.name === "TỔNG") return "text-black extra-bold font-calibri";
    if (row.evaluation === "Không đạt")
      return "bg-[#ffff00] text-black extra-bold";

    // For "Đạt" cases, apply normal alternating background
    const bgClass = rowIndex % 2 !== 0 ? "bg-[#ddebf7]" : "bg-white";
    return `${bgClass} text-black extra-bold`;
  };

  // Function to get cell background color based on row and column
  const getCellBackgroundClass = (
    row: any,
    columnIndex: number,
    rowIndex: number
  ) => {
    // Header row or TỔNG row - no special background handling
    if (row.name === "TỔNG") return "";

    // For "Đánh giá" column (index 5), don't apply background here - let getEvaluationClass handle it
    if (columnIndex === 5) return "";

    // For columns after "Đánh giá" (index > 5), always use white background
    if (columnIndex > 5) return "bg-white";

    // For columns before "Đánh giá" (index 0-4), use alternating colors
    if (rowIndex % 2 !== 0) return "bg-[#ddebf7]";

    return "bg-white";
  };

  // Filter logic
  const filteredReport = useMemo(() => {
    if (!showFilters) return report;

    return report.filter((row) => {
      // Always show TỔNG row
      if (row.name === "TỔNG") return true;

      // Filter by role
      if (filters.role && row.role !== filters.role) return false;

      // Filter by evaluation
      if (filters.evaluation && row.evaluation !== filters.evaluation)
        return false;

      // Filter by name search
      if (
        filters.nameSearch &&
        !row.name.toLowerCase().includes(filters.nameSearch.toLowerCase())
      )
        return false;

      return true;
    });
  }, [report, filters, showFilters]);

  const uniqueRoles = useMemo(() => {
    const roles = [
      ...new Set(report.map((row) => row.role).filter((role) => role)),
    ];
    return roles;
  }, [report]);

  const uniqueEvaluations = useMemo(() => {
    const evaluations = [
      ...new Set(
        report
          .map((row) => row.evaluation)
          .filter((item) => item && item !== "N/A")
      ),
    ];
    return evaluations;
  }, [report]);

  const clearFilters = () => {
    setFilters({
      role: "",
      evaluation: "",
      nameSearch: "",
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-2">
      <div className="max-w-[90%] mx-auto">
        {/*<div className="text-center mb-4">*/}
        {/*  <h1 className="text-2xl font-bold text-gray-800 mb-2">*/}
        {/*    BÁO CÁO KÝ NHẬN*/}
        {/*  </h1>*/}
        {/*</div>*/}

        <div className="mb-3 flex justify-center items-center space-x-3 bg-white rounded-lg p-2 shadow-md">
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={processExcel}
            className="file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-300 rounded-lg text-xs"
          />
          <button
            onClick={() => {
              setReport([]);
              setError(null);
              setFilters({ role: "", evaluation: "", nameSearch: "" });
              setShowFilters(false);
            }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            Xóa Báo Cáo
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
          >
            {showFilters ? (
              <FilterX className="w-3 h-3" />
            ) : (
              <Filter className="w-3 h-3" />
            )}
            <span>{showFilters ? "Ẩn Filter" : "Hiện Filter"}</span>
          </button>
        </div>

        {isLoading && (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <p className="text-blue-600 mt-2 text-xs">Đang xử lý...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-2 py-1 rounded-lg mb-3 text-center text-xs">
            {error}
          </div>
        )}

        {report.length > 0 && (
          <div className="w-full overflow-x-auto">
            <div className="bg-white rounded-lg border shadow-lg">
              {showFilters && (
                <div className="bg-gray-50 border-b border-gray-200 p-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tìm theo tên:
                      </label>
                      <input
                        type="text"
                        value={filters.nameSearch}
                        onChange={(e) =>
                          setFilters({ ...filters, nameSearch: e.target.value })
                        }
                        placeholder="Nhập tên nhân viên..."
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Phân loại:
                      </label>
                      <select
                        value={filters.role}
                        onChange={(e) =>
                          setFilters({ ...filters, role: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Tất cả</option>
                        {uniqueRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Đánh giá:
                      </label>
                      <select
                        value={filters.evaluation}
                        onChange={(e) =>
                          setFilters({ ...filters, evaluation: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Tất cả</option>
                        {uniqueEvaluations.map((evaluation) => (
                          <option key={evaluation} value={evaluation}>
                            {evaluation}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <button
                        onClick={clearFilters}
                        className="w-full bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Xóa Filter
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div id="report-table" className="overflow-x-auto">
                <table className="w-full border border-black text-xs">
                  <thead className="tracking-wider">
                    <tr className="bg-[#92d050] font-times text-white extra-bold">
                      <th className="border border-black px-1 py-1 text-sm extra-bold text-white text-left py-3">
                        Nhân viên phát kiện
                      </th>
                      {[
                        "Số đơn hàng phát",
                        "Tổng đơn ký nhận",
                        "Chưa ký nhận",
                        "Tỷ lệ ký nhận thực tế",
                        "Đánh giá",
                        "Lượng đơn cần đạt 60%",
                        "Lượng đơn thiếu cần xử lý 60%",
                        "T1 -60%",
                        "T2 -70%",
                      ].map((title, i) => (
                        <th
                          key={i}
                          className="border border-black px-1 py-1 text-sm extra-bold text-center"
                        >
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReport.map((row, index) => (
                      <tr
                        key={`${row.name}-${row.role}-${index}`}
                        className={`${
                          row.name === "TỔNG" ? "bg-[#92d050]" : ""
                        }`}
                      >
                        {[
                          row.name,
                          row.orders,
                          row.signed,
                          row.unsigned,
                          row.ratio,
                          row.evaluation,
                          row.target60,
                          row.shortfall60,
                          row.t1,
                          row.t2,
                        ].map((cell, i) => (
                          <td
                            key={i}
                            className={`border border-black px-1 py-0 text-sm text-black ${
                              i === 0 ? "text-left" : "text-center"
                            } ${
                              row.name === "TỔNG"
                                ? "extra-bold font-times tracking-wider"
                                : "font-medium font-calibri tracking-wide"
                            } ${
                              i === 5 ? getEvaluationClass(row, index) : ""
                            } ${getCellBackgroundClass(row, i, index)}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
