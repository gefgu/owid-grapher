import React, { useEffect, useState } from "react"
import dayjs, { Dayjs } from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
dayjs.extend(relativeTime)

export interface LastUpdatedTokenProps {
    timestampUrl?: string
}

export const LastUpdated = ({ timestampUrl }: LastUpdatedTokenProps) => {
    const [date, setDate] = useState<null | Dayjs>(null)
    useEffect(() => {
        const fetchTimeStamp = async () => {
            if (!timestampUrl) return
            const response = await fetch(timestampUrl)
            if (!response.ok) return
            const timestamp = await response.text()
            setDate(
                timestamp.length < 20
                    ? dayjs(`${timestamp}Z`)
                    : dayjs(timestamp)
            )
        }
        fetchTimeStamp()
    }, [])

    return (
        date && (
            <span>
                Last update: <strong>{date.fromNow()}</strong>.
                {/* (
                {date.toDate().toLocaleString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "UTC",
                    timeZoneName: "short",
                })}
                ) */}
            </span>
        )
    )
}
